import Anthropic from "@anthropic-ai/sdk";

/**
 * AI reply generation for the flow builder's AI node. A single Messages API
 * call (Q&A tier) — the customer's conversation in, one assistant reply out.
 *
 * Default model is claude-opus-4-8 (the platform default); set a node-level
 * `model` (e.g. claude-haiku-4-5) to trade quality for cost/latency at scale.
 */

const DEFAULT_MODEL = "claude-opus-4-8";

let _client: Anthropic | undefined;
/** Resolve an Anthropic client. A per-org `apiKey` (from settings) takes
 *  precedence; otherwise the env key is used (and the client is cached). */
function client(apiKey?: string): Anthropic {
  if (apiKey) return new Anthropic({ apiKey });
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("No Claude API key configured.");
  }
  _client ??= new Anthropic();
  return _client;
}

export type AiTurn = { role: "user" | "assistant"; text: string };

/** True if the AI node can run (key present). Lets the engine fall back gracefully. */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function generateAiReply(opts: {
  systemPrompt: string;
  knowledge?: string;
  history: AiTurn[];
  model?: string;
  maxTokens?: number;
  /** Per-org Claude key (overrides the env key). */
  apiKey?: string;
}): Promise<string> {
  const system =
    opts.systemPrompt +
    (opts.knowledge ? `\n\nKnowledge base (answer from this when relevant):\n${opts.knowledge}` : "") +
    "\n\nReply with only the message to send to the customer — no preamble, labels, or explanation.";

  // The Messages API requires the first turn to be `user` AND the conversation
  // to end with a `user` turn (no assistant prefill on this model). Drop leading
  // assistant turns (e.g. a bot greeting) and trailing assistant turns (e.g. the
  // agent's own last message when suggesting a reply), then collapse to {role, content}.
  const turns = [...opts.history];
  while (turns.length && turns[0]!.role !== "user") turns.shift();
  while (turns.length && turns[turns.length - 1]!.role !== "user") turns.pop();
  const messages = turns.map((t) => ({ role: t.role, content: t.text }));
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  const res = await client(opts.apiKey).messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 512,
    system,
    messages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "Sorry, I couldn't generate a reply just now.";
}
