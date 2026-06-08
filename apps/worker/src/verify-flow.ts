/**
 * End-to-end test of the flow ENGINE: a keyword-triggered bot that greets,
 * asks name + email (with email validation + retry), thanks with interpolation,
 * tags the contact, and hands off to an agent. Mocks Meta sends. Cleans up.
 * Run: npm run verify-flow -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import { runFlowsForInbound } from "@watool/processing";

const rnd = () => Math.floor(performance.now()).toString(36) + Math.floor(performance.now() * 13).toString(36);

let sends = 0;
const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes("graph.facebook.com")) {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (body.type) { sends++; sent.push(body.text?.body ?? body.interactive?.body?.text ?? `[${body.type}]`); }
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid." + rnd() }] }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

function graph() {
  const pos = { x: 0, y: 0 };
  return {
    nodes: [
      { id: "t", type: "trigger", position: pos, data: { mode: "keyword", keywords: ["demo"], matchType: "contains" } },
      { id: "welcome", type: "sendMessage", position: pos, data: { bodyType: "text", text: "Welcome 👋", buttons: [] } },
      { id: "qName", type: "askQuestion", position: pos, data: { prompt: "What's your name?", variable: "name", validation: "none" } },
      { id: "qEmail", type: "askQuestion", position: pos, data: { prompt: "And your email?", variable: "email", validation: "email", retryMessage: "That's not a valid email — try again." } },
      { id: "thanks", type: "sendMessage", position: pos, data: { bodyType: "text", text: "Thanks {{name}}! We'll reach you at {{email}}.", buttons: [] } },
      { id: "tag", type: "addTag", position: pos, data: { tags: ["lead"] } },
      { id: "assign", type: "assignAgent", position: pos, data: { team: null } },
      { id: "end", type: "end", position: pos, data: {} },
    ],
    edges: [
      { id: "e1", source: "t", target: "welcome" },
      { id: "e2", source: "welcome", target: "qName" },
      { id: "e3", source: "qName", target: "qEmail" },
      { id: "e4", source: "qEmail", target: "thanks" },
      { id: "e5", source: "thanks", target: "tag" },
      { id: "e6", source: "tag", target: "assign" },
      { id: "e7", source: "assign", target: "end" },
    ],
  };
}

async function inbound(orgId: string, conversationId: string, contactId: string, phoneNumberId: string, text: string) {
  const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (convo.status === "AGENT") return { handled: false };
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  return runFlowsForInbound({
    orgId,
    conversation: { id: convo.id, status: convo.status, windowExpiresAt: convo.windowExpiresAt },
    contact: { id: contact.id, waId: contact.waId, attributes: (contact.attributes as any) ?? {} },
    phoneNumberId,
    accessToken: "tok",
    inboundText: text,
  });
}

async function main() {
  const org = await prisma.org.create({ data: { name: "Flow Test", slug: "flow-" + rnd() } });
  const acc = await prisma.whatsAppAccount.create({ data: { orgId: org.id, wabaId: "W" + rnd(), accessTokenEnc: "x", status: "CONNECTED" } });
  const pn = await prisma.phoneNumber.create({ data: { whatsAppAccountId: acc.id, phoneNumberId: "P" + rnd(), displayNumber: "+1 555" } });
  const contact = await prisma.contact.create({ data: { orgId: org.id, waId: "15557770000", name: "Lead" } });
  const convo = await prisma.conversation.create({ data: { orgId: org.id, contactId: contact.id, phoneNumberId: pn.id, status: "BOT", windowExpiresAt: new Date(Date.now() + 3600_000) } });
  const flow = await prisma.flow.create({ data: { orgId: org.id, name: "Demo bot", status: "PUBLISHED" } });
  await prisma.flowVersion.create({ data: { flowId: flow.id, version: 1, graphJSON: graph(), publishedAt: new Date() } });
  console.log("→ seeded a published keyword flow\n");

  try {
    // Step 1: trigger keyword
    let r = await inbound(org.id, convo.id, contact.id, pn.phoneNumberId, "demo please");
    assert(r.handled, "keyword 'demo' triggered the flow");
    let run = await prisma.flowRun.findFirstOrThrow({ where: { conversationId: convo.id } });
    assert(run.status === "ACTIVE" && run.currentNodeId === "qName", "paused waiting for name");
    assert(sent.includes("Welcome 👋"), "sent the welcome message");
    assert(sent.includes("What's your name?"), "asked for name");

    // Step 2: answer name
    await inbound(org.id, convo.id, contact.id, pn.phoneNumberId, "Alice");
    run = await prisma.flowRun.findFirstOrThrow({ where: { conversationId: convo.id } });
    assert(run.currentNodeId === "qEmail", "stored name, now waiting for email");
    assert((run.state as any).name === "Alice", "state.name = Alice");

    // Step 3: invalid email → retry, stay put
    await inbound(org.id, convo.id, contact.id, pn.phoneNumberId, "not-an-email");
    run = await prisma.flowRun.findFirstOrThrow({ where: { conversationId: convo.id } });
    assert(run.currentNodeId === "qEmail", "invalid email kept us on the email question");
    assert(sent.some((s) => s.includes("not a valid email")), "sent the validation retry message");

    // Step 4: valid email → finish
    await inbound(org.id, convo.id, contact.id, pn.phoneNumberId, "alice@example.com");
    run = await prisma.flowRun.findFirstOrThrow({ where: { conversationId: convo.id } });
    assert(run.status === "COMPLETED", "flow run COMPLETED");
    assert((run.state as any).email === "alice@example.com", "state.email captured");
    assert(sent.some((s) => s === "Thanks Alice! We'll reach you at alice@example.com."), "interpolated the thank-you message");
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: convo.id } });
    assert(after.status === "AGENT", "handed off to agent (status AGENT)");
    const tags = await prisma.contactTag.findMany({ where: { contactId: contact.id }, include: { tag: true } });
    assert(tags.some((t) => t.tag.name === "lead"), "tagged the contact 'lead'");

    // Answers must persist onto the contact as variables (custom fields).
    const c2 = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    assert((c2.attributes as any).name === "Alice", "answer 'name' saved to contact attributes");
    assert((c2.attributes as any).email === "alice@example.com", "answer 'email' saved to contact attributes");

    console.log("\nFLOW ENGINE VERIFIED ✅");
  } finally {
    await prisma.org.delete({ where: { id: org.id } });
    console.log("✓ cleaned up");
  }
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
