import { prisma, MessageStatus, Prisma } from "@watool/db";
import {
  WhatsAppWebhookSchema,
  normalizeWebhook,
  extractInboundText,
  decryptSecret,
  createWhatsAppClient,
  type InboundMessage,
  type WaStatus,
  type NormalizedChange,
} from "@watool/wa";
import type { WaInboundJob } from "@watool/queue";
import { runFlowsForInbound } from "./engine";

/**
 * Inbound WhatsApp processing — shared by the BullMQ worker (queued path) and,
 * when no queue is configured, the web webhook route (inline path). It turns a
 * raw webhook event into contacts/conversations/messages, enforces the 24h
 * window on the auto-reply, and reconciles delivery statuses. Idempotent on
 * waMessageId (Meta re-delivers).
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

const PHASE1_REPLY =
  "👋 Hi from Chatleaf! Thanks for your message — we've got it and someone will be right with you.";

const STATUS_MAP: Record<WaStatus["status"], MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

export async function processInboundJob(job: WaInboundJob): Promise<void> {
  const parsed = WhatsAppWebhookSchema.safeParse(job.raw);
  if (!parsed.success) {
    console.error("[inbound] schema validation failed:", parsed.error.issues?.[0]);
    await markEvent(job.webhookEventId, "Schema validation failed");
    return;
  }

  const changes = normalizeWebhook(parsed.data);
  let lastError: string | undefined;

  for (const change of changes) {
    try {
      await handleChange(change);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error("[inbound] change failed:", lastError);
    }
  }

  await markEvent(job.webhookEventId, lastError);
}

async function handleChange(change: NormalizedChange): Promise<void> {
  // Resolve tenant from phone_number_id (the routing key).
  const phoneNumber = await prisma.phoneNumber.findUnique({
    where: { phoneNumberId: change.phoneNumberId },
    include: { account: true },
  });

  if (!phoneNumber) {
    throw new Error(
      `No connected phone number for phone_number_id=${change.phoneNumberId}. ` +
        `Connect it in Settings → WhatsApp.`,
    );
  }
  const orgId = phoneNumber.account.orgId;

  for (const msg of change.messages) {
    await handleInboundMessage(orgId, phoneNumber, change, msg);
  }
  for (const st of change.statuses) {
    await handleStatus(orgId, st);
  }
}

async function handleInboundMessage(
  orgId: string,
  phoneNumber: {
    id: string;
    phoneNumberId: string;
    account: { accessTokenEnc: string | null };
  },
  change: NormalizedChange,
  msg: InboundMessage,
): Promise<void> {
  // Idempotency: Meta re-delivers. Skip if we've already stored this message.
  const existing = await prisma.message.findUnique({
    where: { waMessageId: msg.id },
  });
  if (existing) return;

  const contact = await prisma.contact.upsert({
    where: { orgId_waId: { orgId, waId: msg.from } },
    create: {
      orgId,
      waId: msg.from,
      name: change.contactName,
      phone: msg.from,
      lastInboundAt: new Date(),
    },
    update: {
      lastInboundAt: new Date(),
      ...(change.contactName ? { name: change.contactName } : {}),
    },
  });

  const windowExpiresAt = new Date(Date.now() + WINDOW_MS);
  let conversation = await prisma.conversation.findFirst({
    where: {
      orgId,
      contactId: contact.id,
      phoneNumberId: phoneNumber.id,
      status: { not: "CLOSED" },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        orgId,
        contactId: contact.id,
        phoneNumberId: phoneNumber.id,
        status: "BOT",
        windowExpiresAt,
        lastMessageAt: new Date(),
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { windowExpiresAt, lastMessageAt: new Date() },
    });
  }

  await prisma.message.create({
    data: {
      orgId,
      conversationId: conversation.id,
      direction: "IN",
      waMessageId: msg.id,
      type: msg.type,
      payload: msg as object,
      status: "DELIVERED",
    },
  });

  const inboundText = extractInboundText(msg);
  console.log(
    `[inbound] from ${msg.from} (org ${orgId}): ${inboundText ?? `[${msg.type}]`}`,
  );

  // A human has taken over → bot stays quiet.
  if (conversation.status === "AGENT") return;

  // Decrypt the access token once for both the engine and the fallback reply.
  const tokenEnc = phoneNumber.account.accessTokenEnc;
  if (!tokenEnc) {
    console.warn(`[inbound] no access token stored for ${phoneNumber.phoneNumberId}; skip reply`);
    return;
  }
  const accessToken = decryptSecret(tokenEnc);

  // Run published flows: resume an active run, or match a trigger.
  const { handled } = await runFlowsForInbound({
    orgId,
    conversation: {
      id: conversation.id,
      status: conversation.status,
      windowExpiresAt: conversation.windowExpiresAt,
    },
    contact: {
      id: contact.id,
      waId: contact.waId,
      attributes: (contact.attributes as Record<string, unknown>) ?? {},
    },
    phoneNumberId: phoneNumber.phoneNumberId,
    accessToken,
    inboundText,
  });

  // Nothing matched → fall back to the default hello (keeps the connectivity
  // demo working before any flow is published).
  if (!handled) {
    await sendHelloReply(orgId, phoneNumber.phoneNumberId, accessToken, conversation, msg);
  }
}

async function sendHelloReply(
  orgId: string,
  phoneNumberId: string,
  accessToken: string,
  conversation: { id: string; windowExpiresAt: Date | null },
  inbound: InboundMessage,
): Promise<void> {
  const client = createWhatsAppClient({ phoneNumberId, accessToken });

  const outbound = await prisma.message.create({
    data: {
      orgId,
      conversationId: conversation.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body: PHASE1_REPLY } },
      status: "QUEUED",
    },
  });

  try {
    await client.markRead(inbound.id);
    const result = await client.sendText(
      inbound.from,
      PHASE1_REPLY,
      conversation.windowExpiresAt,
    );
    await prisma.message.update({
      where: { id: outbound.id },
      data: { waMessageId: result.waMessageId, status: "SENT" },
    });
    console.log(`[inbound] replied to ${inbound.from} (wa id ${result.waMessageId})`);
  } catch (err) {
    await prisma.message.update({
      where: { id: outbound.id },
      data: {
        status: "FAILED",
        errorJSON: { message: err instanceof Error ? err.message : String(err) },
      },
    });
    throw err;
  }
}

async function handleStatus(orgId: string, st: WaStatus): Promise<void> {
  const updated = await prisma.message.updateMany({
    where: { orgId, waMessageId: st.id },
    data: {
      status: STATUS_MAP[st.status],
      ...(st.errors
        ? { errorJSON: { errors: st.errors } as Prisma.InputJsonValue }
        : {}),
    },
  });
  // Keep broadcast recipient delivery state in sync (delivered/read/failed).
  await prisma.broadcastRecipient.updateMany({
    where: { waMessageId: st.id },
    data: { status: st.status },
  });

  if (updated.count > 0) {
    console.log(`[inbound] status ${st.status} for wa id ${st.id}`);
  }
}

async function markEvent(id: string, error?: string): Promise<void> {
  await prisma.webhookEvent
    .update({
      where: { id },
      data: { processedAt: new Date(), error: error ?? null },
    })
    .catch(() => {
      /* audit best-effort */
    });
}
