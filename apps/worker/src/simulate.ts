/**
 * Offline end-to-end verification of the Phase 1 inbound pipeline.
 *
 * Exercises the REAL worker logic (processInboundJob) against the live DB, but:
 *   - bypasses Redis/BullMQ (calls the processor directly), and
 *   - mocks `fetch` so the WhatsApp send is deterministic and offline.
 *
 * Run: npm run simulate -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { processInboundJob } from "@watool/processing";

const WABA_ID = "SIMWABA_" + Math.floor(performance.now()).toString(36);
const PHONE_NUMBER_ID = "SIMPHONE_" + Math.floor(performance.now()).toString(36);
const CONTACT_WA = "15551234567";
const IN_MSG_ID = "wamid.SIM.IN." + Math.floor(performance.now());
const OUT_MSG_ID = "wamid.SIM.OUT.MOCK";

let sendCalls = 0;

// Mock Meta Graph API. Prisma uses its own engine (not fetch), so only the WA
// client is affected.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.includes("graph.facebook.com")) {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (body.status === "read") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    sendCalls++;
    return new Response(
      JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ wa_id: CONTACT_WA }],
        messages: [{ id: OUT_MSG_ID }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("✓ " + msg);
}

function inboundPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550100100",
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ wa_id: CONTACT_WA, profile: { name: "Alice Tester" } }],
              messages: [
                {
                  from: CONTACT_WA,
                  id: IN_MSG_ID,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "hi there" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550100100",
                phone_number_id: PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: OUT_MSG_ID,
                  status: "read",
                  timestamp: "1700000005",
                  recipient_id: CONTACT_WA,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  // ── Seed a connected tenant ──────────────────────────────────────────────
  const org = await prisma.org.create({
    data: { name: "Sim Co", slug: "sim-" + Math.floor(performance.now()).toString(36) },
  });
  const account = await prisma.whatsAppAccount.create({
    data: {
      orgId: org.id,
      wabaId: WABA_ID,
      accessTokenEnc: encryptSecret("dummy-access-token"),
      status: "CONNECTED",
    },
  });
  await prisma.phoneNumber.create({
    data: {
      whatsAppAccountId: account.id,
      phoneNumberId: PHONE_NUMBER_ID,
      displayNumber: "+1 555 010 0100",
    },
  });
  console.log("→ seeded org", org.id);

  try {
    // ── 1. Process an inbound message ───────────────────────────────────────
    const ev1 = await prisma.webhookEvent.create({ data: { raw: inboundPayload() } });
    await processInboundJob({ webhookEventId: ev1.id, raw: inboundPayload() });

    const contact = await prisma.contact.findUnique({
      where: { orgId_waId: { orgId: org.id, waId: CONTACT_WA } },
    });
    assert(contact, "contact created from inbound message");
    assert(contact!.name === "Alice Tester", "contact name captured from profile");

    const convo = await prisma.conversation.findFirst({
      where: { orgId: org.id, contactId: contact!.id },
    });
    assert(convo, "conversation opened");
    assert(convo!.status === "BOT", "conversation status is BOT");
    assert(
      convo!.windowExpiresAt && convo!.windowExpiresAt.getTime() > Date.now(),
      "24h window set in the future",
    );

    const inMsg = await prisma.message.findUnique({ where: { waMessageId: IN_MSG_ID } });
    assert(inMsg && inMsg.direction === "IN", "inbound message stored (direction IN)");

    assert(sendCalls === 1, "WhatsApp send was called exactly once");
    const outMsg = await prisma.message.findUnique({ where: { waMessageId: OUT_MSG_ID } });
    assert(outMsg && outMsg.direction === "OUT", "outbound hello stored (direction OUT)");
    assert(outMsg!.status === "SENT", "outbound message marked SENT");

    const ev1After = await prisma.webhookEvent.findUnique({ where: { id: ev1.id } });
    assert(ev1After!.processedAt, "webhook event marked processed");

    // ── 2. Idempotency: re-deliver the same inbound ─────────────────────────
    const ev2 = await prisma.webhookEvent.create({ data: { raw: inboundPayload() } });
    await processInboundJob({ webhookEventId: ev2.id, raw: inboundPayload() });
    const inCount = await prisma.message.count({
      where: { orgId: org.id, direction: "IN" },
    });
    assert(inCount === 1, "duplicate delivery did NOT create a second inbound message");
    assert(sendCalls === 1, "duplicate delivery did NOT trigger a second reply");

    // ── 3. Delivery status webhook ──────────────────────────────────────────
    const ev3 = await prisma.webhookEvent.create({ data: { raw: statusPayload() } });
    await processInboundJob({ webhookEventId: ev3.id, raw: statusPayload() });
    const outAfter = await prisma.message.findUnique({ where: { waMessageId: OUT_MSG_ID } });
    assert(outAfter!.status === "READ", "status webhook updated outbound to READ");

    console.log("\nPHASE 1 PIPELINE VERIFIED ✅");
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    await prisma.webhookEvent.deleteMany({
      where: { raw: { path: ["entry", "0", "id"], equals: WABA_ID } },
    });
    await prisma.org.delete({ where: { id: org.id } }); // cascades account/phone/contact/convo/msg
    console.log("✓ cleaned up");
  }
}

main()
  .catch((e) => {
    console.error("\nSIMULATION FAILED ❌\n", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
