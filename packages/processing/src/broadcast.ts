import { prisma, Prisma } from "@watool/db";
import { createWhatsAppClient, decryptSecret } from "@watool/wa";

/**
 * Send a broadcast: resolve the audience, then send the (approved) template to
 * each contact, recording a BroadcastRecipient + an outbound Message so it shows
 * in the inbox and status webhooks can reconcile delivery.
 *
 * Opt-in is enforced by default (Meta bans numbers that message non-opted-in
 * contacts). Broadcasts are business-initiated, so they ALWAYS use a template
 * (no 24h-window free-form) — that's why we call sendTemplate, not sendText.
 *
 * In dev this runs inline; at scale it belongs on the BullMQ broadcast worker
 * with per-number rate limiting. The structure here is queue-ready.
 */
export type AudienceFilter = { optedInOnly?: boolean; tag?: string };

export async function sendBroadcast(
  broadcastId: string,
): Promise<{ total: number; sent: number; failed: number }> {
  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { template: true, segment: true },
  });
  if (!b) throw new Error("Broadcast not found");

  const account = await prisma.whatsAppAccount.findFirst({
    where: { orgId: b.orgId },
    include: { phoneNumbers: true },
  });
  const phone = account?.phoneNumbers[0];
  if (!account?.accessTokenEnc || !phone) {
    await prisma.broadcast.update({ where: { id: b.id }, data: { status: "FAILED" } });
    throw new Error("Connect a WhatsApp number first (Settings → WhatsApp).");
  }

  const client = createWhatsAppClient({
    phoneNumberId: phone.phoneNumberId,
    accessToken: decryptSecret(account.accessTokenEnc),
  });

  const filter = (b.segment?.filterJSON as AudienceFilter) ?? { optedInOnly: true };
  const contacts = await prisma.contact.findMany({
    where: {
      orgId: b.orgId,
      ...(filter.optedInOnly === false ? {} : { optInStatus: "OPTED_IN" }),
      ...(filter.tag ? { contactTags: { some: { tag: { name: filter.tag } } } } : {}),
    },
  });

  await prisma.broadcast.update({ where: { id: b.id }, data: { status: "RUNNING" } });

  let sent = 0;
  let failed = 0;
  for (const contact of contacts) {
    let convo = await prisma.conversation.findFirst({
      where: { orgId: b.orgId, contactId: contact.id, phoneNumberId: phone.id, status: { not: "CLOSED" } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (!convo) {
      convo = await prisma.conversation.create({
        data: { orgId: b.orgId, contactId: contact.id, phoneNumberId: phone.id, status: "BOT", lastMessageAt: new Date() },
      });
    }

    const recipient = await prisma.broadcastRecipient.create({
      data: { broadcastId: b.id, contactId: contact.id, status: "pending" },
    });
    const msg = await prisma.message.create({
      data: {
        orgId: b.orgId,
        conversationId: convo.id,
        direction: "OUT",
        type: "template",
        payload: { template: b.template.name, language: b.template.language, broadcastId: b.id },
        status: "QUEUED",
      },
    });

    try {
      const r = await client.sendTemplate(contact.waId, b.template.name, b.template.language);
      await prisma.message.update({ where: { id: msg.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "sent", waMessageId: r.waMessageId } });
      await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", errorJSON: { message } } });
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "failed" } });
      failed++;
    }
  }

  await prisma.broadcast.update({
    where: { id: b.id },
    data: {
      status: "COMPLETED",
      stats: { total: contacts.length, sent, failed } as Prisma.InputJsonValue,
    },
  });

  return { total: contacts.length, sent, failed };
}
