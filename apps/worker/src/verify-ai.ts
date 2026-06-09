/**
 * Verifies the AI-reply flow node end-to-end (Anthropic + WhatsApp mocked):
 * keyword trigger → aiReply (Claude) → reply sent + saved to a variable.
 * Run: npm run verify-ai -w @watool/worker
 */
import "dotenv/config";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key"; // enable the AI node offline

import { prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { runFlowsForInbound } from "@watool/processing";

const rnd = () => Math.floor(performance.now()).toString(36) + Math.floor(performance.now() * 29).toString(36);
const AI_TEXT = "Here's the answer to your question.";

let anthropicCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) {
    anthropicCalls++;
    return new Response(
      JSON.stringify({
        id: "msg_" + rnd(),
        type: "message",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [{ type: "text", text: AI_TEXT }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 12, output_tokens: 8 },
      }),
      { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } },
    );
  }
  if (u.includes("graph.facebook.com")) {
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid." + rnd() }] }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

const graph = (triggerId: string, aiId: string, endId: string) => ({
  nodes: [
    { id: triggerId, position: { x: 0, y: 0 }, type: "trigger", data: { mode: "keyword", keywords: ["ai"], matchType: "contains" } },
    { id: aiId, position: { x: 0, y: 100 }, type: "aiReply", data: { systemPrompt: "You are support.", maxTokens: 256, saveToVariable: "ai_answer" } },
    { id: endId, position: { x: 0, y: 200 }, type: "end", data: {} },
  ],
  edges: [
    { id: "e1", source: triggerId, target: aiId },
    { id: "e2", source: aiId, target: endId },
  ],
});

async function main() {
  const org = await prisma.org.create({ data: { name: "AI Test", slug: "ai-" + rnd() } });
  try {
    const acc = await prisma.whatsAppAccount.create({ data: { orgId: org.id, wabaId: "W" + rnd(), accessTokenEnc: encryptSecret("tok"), status: "CONNECTED" } });
    const pn = await prisma.phoneNumber.create({ data: { whatsAppAccountId: acc.id, phoneNumberId: "P" + rnd(), displayNumber: "+1 555" } });
    const contact = await prisma.contact.create({ data: { orgId: org.id, waId: "15551234567", name: "Cust", attributes: {} } });
    const convo = await prisma.conversation.create({
      data: { orgId: org.id, contactId: contact.id, phoneNumberId: pn.id, status: "BOT", windowExpiresAt: new Date(Date.now() + 3600_000) },
    });
    // Inbound message in history.
    await prisma.message.create({ data: { orgId: org.id, conversationId: convo.id, direction: "IN", type: "text", payload: { type: "text", text: { body: "ai please help me" } }, status: "DELIVERED", waMessageId: "wamid.in." + rnd() } });

    const flow = await prisma.flow.create({ data: { orgId: org.id, name: "AI Flow", status: "PUBLISHED" } });
    const version = await prisma.flowVersion.create({ data: { flowId: flow.id, version: 1, graphJSON: graph("t1", "a1", "e1") as any, publishedAt: new Date() } });
    void version;

    const res = await runFlowsForInbound({
      orgId: org.id,
      conversation: { id: convo.id, status: "BOT", windowExpiresAt: convo.windowExpiresAt },
      contact: { id: contact.id, waId: contact.waId, attributes: {} },
      phoneNumberId: pn.phoneNumberId,
      accessToken: "tok",
      inboundText: "ai please help me",
    });

    assert(res.handled, "flow matched the 'ai' keyword and ran");
    assert(anthropicCalls === 1, "Claude was called exactly once");

    const out = await prisma.message.findFirst({ where: { conversationId: convo.id, direction: "OUT" }, orderBy: { createdAt: "desc" } });
    assert(out, "an outbound message was created");
    assert((out!.payload as any).text.body === AI_TEXT, "the AI's reply was sent to the customer");
    assert(out!.status === "SENT", "outbound AI reply marked SENT");

    const c2 = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    assert((c2.attributes as any).ai_answer === AI_TEXT, "AI answer saved to the contact variable");

    const run = await prisma.flowRun.findFirst({ where: { conversationId: convo.id } });
    assert(run!.status === "COMPLETED", "flow run completed");

    console.log("\nAI NODE VERIFIED ✅");
  } finally {
    await prisma.org.delete({ where: { id: org.id } });
    console.log("✓ cleaned up");
  }
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
