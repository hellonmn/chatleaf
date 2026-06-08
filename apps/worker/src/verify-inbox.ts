/**
 * Verifies the agent-reply mechanics used by sendReplyAction:
 *  - WA client enforces the 24h window (sendText throws when closed, no HTTP)
 *  - window OPEN  → outbound SENT + conversation flips to AGENT + assigned
 *  - window CLOSED → outbound FAILED + conversation status unchanged
 * Mocks fetch so it's offline. Run: npm run verify-inbox -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import {
  createWhatsAppClient,
  encryptSecret,
  decryptSecret,
  WindowClosedError,
} from "@watool/wa";

const rnd = () =>
  Math.floor(performance.now()).toString(36) +
  Math.floor(performance.now() * 7).toString(36);

let sendCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes("graph.facebook.com")) {
    sendCalls++;
    return new Response(
      JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.REPLY." + rnd() }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

function assert(c: unknown, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
  console.log("✓ " + m);
}

/** Mirror of sendReplyAction's core, minus the auth/session wrapper. */
async function reply(orgId: string, conversationId: string, userId: string, text: string) {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: { contact: true, phoneNumber: { include: { account: true } } },
  });
  if (!convo) throw new Error("convo not found");
  const client = createWhatsAppClient({
    phoneNumberId: convo.phoneNumber.phoneNumberId,
    accessToken: decryptSecret(convo.phoneNumber.account.accessTokenEnc!),
  });
  const out = await prisma.message.create({
    data: { orgId, conversationId, direction: "OUT", type: "text", payload: { text: { body: text } }, status: "QUEUED" },
  });
  try {
    const r = await client.sendText(convo.contact.waId, text, convo.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
    await prisma.conversation.update({ where: { id: convo.id }, data: { status: "AGENT", assignedUserId: userId } });
    return { ok: true as const };
  } catch (e) {
    await prisma.message.update({ where: { id: out.id }, data: { status: "FAILED", errorJSON: { message: String(e) } } });
    return { ok: false as const, windowClosed: e instanceof WindowClosedError };
  }
}

async function setup(windowOpen: boolean) {
  const org = await prisma.org.create({ data: { name: "Inbox Test", slug: "inbox-" + rnd() } });
  const user = await prisma.user.create({ data: { email: `agent+${rnd()}@t.test`, name: "Agent" } });
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "AGENT" } });
  const acc = await prisma.whatsAppAccount.create({
    data: { orgId: org.id, wabaId: "W" + rnd(), accessTokenEnc: encryptSecret("tok"), status: "CONNECTED" },
  });
  const pn = await prisma.phoneNumber.create({
    data: { whatsAppAccountId: acc.id, phoneNumberId: "P" + rnd(), displayNumber: "+1 555" },
  });
  const contact = await prisma.contact.create({ data: { orgId: org.id, waId: "15551230000", name: "Cust" } });
  const convo = await prisma.conversation.create({
    data: {
      orgId: org.id, contactId: contact.id, phoneNumberId: pn.id, status: "BOT",
      windowExpiresAt: new Date(Date.now() + (windowOpen ? 3600_000 : -3600_000)),
    },
  });
  return { org, user, convo };
}

async function main() {
  // Case 1: window OPEN
  {
    const { org, user, convo } = await setup(true);
    const res = await reply(org.id, convo.id, user.id, "Hi, how can I help?");
    assert(res.ok, "open window: send succeeded");
    assert(sendCalls === 1, "open window: HTTP send was made");
    const after = await prisma.conversation.findUnique({ where: { id: convo.id } });
    assert(after!.status === "AGENT", "open window: conversation flipped to AGENT");
    assert(after!.assignedUserId === user.id, "open window: assigned to the agent");
    const out = await prisma.message.findFirst({ where: { conversationId: convo.id, direction: "OUT" } });
    assert(out!.status === "SENT", "open window: outbound marked SENT");
    await prisma.org.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  // Case 2: window CLOSED
  {
    sendCalls = 0;
    const { org, user, convo } = await setup(false);
    const res = await reply(org.id, convo.id, user.id, "too late");
    assert(!res.ok && res.windowClosed, "closed window: blocked with WindowClosedError");
    assert(sendCalls === 0, "closed window: NO HTTP send was made");
    const after = await prisma.conversation.findUnique({ where: { id: convo.id } });
    assert(after!.status === "BOT", "closed window: conversation status unchanged");
    const out = await prisma.message.findFirst({ where: { conversationId: convo.id, direction: "OUT" } });
    assert(out!.status === "FAILED", "closed window: outbound marked FAILED");
    await prisma.org.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log("\nINBOX REPLY PATH VERIFIED ✅");
}

main()
  .catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
