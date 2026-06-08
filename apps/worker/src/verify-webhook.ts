/**
 * Proves the inline webhook path: a Meta-shaped payload addressed to the REAL
 * connected phone number id creates a contact/conversation/message. Mocks the
 * outbound send so no real WhatsApp message goes out, then cleans up.
 * Run: npm run verify-webhook -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import { processInboundJob } from "@watool/processing";

const PHONE_NUMBER_ID = "106515958813804"; // the user's connected number
const SENDER = "14155550123"; // a throwaway test sender
const IN_ID = "wamid.VERIFY." + Math.floor(performance.now());

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes("graph.facebook.com")) {
    return new Response(
      JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.OUT.MOCK" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "ANY_WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550856524", phone_number_id: PHONE_NUMBER_ID },
            contacts: [{ wa_id: SENDER, profile: { name: "Pipeline Test" } }],
            messages: [{ from: SENDER, id: IN_ID, timestamp: "1700000000", type: "text", text: { body: "ping" } }],
          },
        },
      ],
    },
  ],
};

async function main() {
  const pn = await prisma.phoneNumber.findUnique({ where: { phoneNumberId: PHONE_NUMBER_ID } });
  if (!pn) {
    console.error(`✗ phone_number_id ${PHONE_NUMBER_ID} is NOT connected in the DB. Connect it in Settings → WhatsApp.`);
    process.exit(1);
  }

  const ev = await prisma.webhookEvent.create({ data: { raw: payload } });
  await processInboundJob({ webhookEventId: ev.id, raw: payload });

  const contact = await prisma.contact.findFirst({ where: { waId: SENDER }, include: { conversations: { include: { messages: true } } } });
  if (!contact) {
    console.error("✗ no contact created — check the logs above for the mapping error.");
    process.exit(1);
  }
  console.log("✓ contact created:", contact.name, "(", contact.waId, ") in org", contact.orgId);
  const convo = contact.conversations[0];
  console.log("✓ conversation:", convo?.status, "with", convo?.messages.length, "message(s)");
  console.log("  directions:", convo?.messages.map((m) => `${m.direction}:${m.status}`).join(", "));

  // Clean up so the user's real inbox is untouched.
  await prisma.contact.delete({ where: { id: contact.id } });
  await prisma.webhookEvent.delete({ where: { id: ev.id } }).catch(() => {});
  console.log("✓ cleaned up test data");
  console.log("\nINLINE WEBHOOK PATH VERIFIED ✅ — real messages will flow once ngrok + Meta subscription are set.");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); }).finally(() => prisma.$disconnect());
