/**
 * Verifies broadcasts: opt-in enforcement, tag filtering, per-recipient sends,
 * stats, and delivery-status updates from a status webhook. Mocks Meta. Cleans up.
 * Run: npm run verify-broadcast -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { sendBroadcast, processInboundJob } from "@watool/processing";

const rnd = () => Math.floor(performance.now()).toString(36) + Math.floor(performance.now() * 17).toString(36);

let nextId = 1;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any) => {
  if (String(url).includes("graph.facebook.com")) {
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.BC." + nextId++ }] }), { status: 200 });
  }
  return realFetch(url);
}) as typeof fetch;

function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

async function main() {
  const org = await prisma.org.create({ data: { name: "BC Test", slug: "bc-" + rnd() } });
  const acc = await prisma.whatsAppAccount.create({ data: { orgId: org.id, wabaId: "W" + rnd(), accessTokenEnc: encryptSecret("tok"), status: "CONNECTED" } });
  const pn = await prisma.phoneNumber.create({ data: { whatsAppAccountId: acc.id, phoneNumberId: "P" + rnd(), displayNumber: "+1 555" } });
  const tpl = await prisma.template.create({ data: { orgId: org.id, name: "hello_" + rnd(), language: "en_US", category: "MARKETING", components: [], metaStatus: "APPROVED" } });

  const vip = await prisma.tag.create({ data: { orgId: org.id, name: "vip" } });
  const c1 = await prisma.contact.create({ data: { orgId: org.id, waId: "111", name: "Opted VIP", optInStatus: "OPTED_IN" } });
  await prisma.contactTag.create({ data: { contactId: c1.id, tagId: vip.id } });
  const c2 = await prisma.contact.create({ data: { orgId: org.id, waId: "222", name: "Opted", optInStatus: "OPTED_IN" } });
  await prisma.contact.create({ data: { orgId: org.id, waId: "333", name: "OptedOut", optInStatus: "OPTED_OUT" } });

  try {
    // Broadcast 1: all opted-in → c1 + c2, NOT the opted-out one.
    const seg1 = await prisma.segment.create({ data: { orgId: org.id, name: "all", filterJSON: { optedInOnly: true } } });
    const b1 = await prisma.broadcast.create({ data: { orgId: org.id, templateId: tpl.id, segmentId: seg1.id, status: "DRAFT" } });
    const r1 = await sendBroadcast(b1.id);
    assert(r1.sent === 2 && r1.failed === 0, "all-opted-in sent to exactly 2 (opted-out excluded)");
    const recips1 = await prisma.broadcastRecipient.findMany({ where: { broadcastId: b1.id }, include: { contact: true } });
    assert(!recips1.some((r) => r.contact.optInStatus === "OPTED_OUT"), "no opted-out contact received it");
    const b1after = await prisma.broadcast.findUniqueOrThrow({ where: { id: b1.id } });
    assert(b1after.status === "COMPLETED", "broadcast marked COMPLETED");
    assert((b1after.stats as any).sent === 2, "stats.sent = 2");

    // Broadcast 2: tag filter "vip" → only c1.
    const seg2 = await prisma.segment.create({ data: { orgId: org.id, name: "vip", filterJSON: { optedInOnly: true, tag: "vip" } } });
    const b2 = await prisma.broadcast.create({ data: { orgId: org.id, templateId: tpl.id, segmentId: seg2.id, status: "DRAFT" } });
    const r2 = await sendBroadcast(b2.id);
    assert(r2.sent === 1, "tag-filtered broadcast sent to exactly 1 (the vip)");

    // Delivery status webhook → recipient becomes 'read'.
    const recip = await prisma.broadcastRecipient.findFirstOrThrow({ where: { broadcastId: b2.id } });
    const statusPayload = {
      object: "whatsapp_business_account",
      entry: [{ id: "ANY", changes: [{ field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "1", phone_number_id: pn.phoneNumberId },
        statuses: [{ id: recip.waMessageId, status: "read", timestamp: "1", recipient_id: "111" }],
      } }] }],
    };
    const ev = await prisma.webhookEvent.create({ data: { raw: statusPayload } });
    await processInboundJob({ webhookEventId: ev.id, raw: statusPayload });
    const recipAfter = await prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: recip.id } });
    assert(recipAfter.status === "read", "status webhook updated recipient → read");

    console.log("\nBROADCAST VERIFIED ✅");
  } finally {
    await prisma.webhookEvent.deleteMany({ where: { raw: { path: ["entry", "0", "id"], equals: "ANY" } } });
    await prisma.org.delete({ where: { id: org.id } });
    console.log("✓ cleaned up");
  }
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
