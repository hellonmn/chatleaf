import { z } from "zod";

/**
 * Flow graph schema — the serialized form of a chatbot built in the visual
 * builder (React Flow). Stored in `FlowVersion.graphJSON`. The flow engine
 * (Phase 3) executes this; defining it now anchors the FE/BE contract early.
 *
 * A flow is a directed graph of nodes connected by edges. Each node has a
 * `type` discriminator and a `data` payload specific to that type.
 */

export const NODE_TYPES = [
  "trigger",
  "sendMessage",
  "askQuestion",
  "condition",
  "setAttribute",
  "addTag",
  "httpRequest",
  "assignAgent",
  "aiReply",
  "delay",
  "end",
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** Canvas position for React Flow. */
const PositionSchema = z.object({ x: z.number(), y: z.number() });

// ── Per-node data payloads ──────────────────────────────────────────────

/** How a flow run is started. */
const TriggerData = z.object({
  mode: z.enum(["keyword", "anyMessage", "optIn", "buttonClick"]),
  /** Keywords that start the flow (mode = "keyword"). Case-insensitive. */
  keywords: z.array(z.string()).default([]),
  matchType: z.enum(["exact", "contains"]).default("contains"),
});

const MessageButton = z.object({
  id: z.string(),
  label: z.string().max(20),
});

const SendMessageData = z.object({
  bodyType: z.enum(["text", "image", "document", "video", "buttons", "list"]),
  text: z.string().default(""),
  mediaUrl: z.string().url().optional(),
  /** Up to 3 reply buttons (WhatsApp limit) when bodyType = "buttons". */
  buttons: z.array(MessageButton).max(3).default([]),
});

const AskQuestionData = z.object({
  prompt: z.string(),
  /** Variable name to store the reply under in FlowRun.state. */
  variable: z.string().min(1),
  validation: z
    .enum(["none", "email", "number", "phone", "regex"])
    .default("none"),
  regex: z.string().optional(),
  /** Re-ask message if validation fails. */
  retryMessage: z.string().optional(),
  /** Optional quick-reply buttons; tapping one fills the answer. */
  buttons: z.array(MessageButton).max(3).default([]),
});

const ConditionRule = z.object({
  variable: z.string(),
  op: z.enum(["eq", "neq", "contains", "gt", "lt", "exists", "notExists"]),
  value: z.string().optional(),
  /** Edge id to follow when this rule matches. */
  targetHandle: z.string(),
});
const ConditionData = z.object({
  rules: z.array(ConditionRule),
  /** Fallback edge when no rule matches. */
  defaultHandle: z.string(),
});

const SetAttributeData = z.object({
  attribute: z.string().min(1),
  value: z.string(),
});

const AddTagData = z.object({
  tags: z.array(z.string()).min(1),
});

const HttpRequestData = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  /** Map JSONPath-ish keys from the response into FlowRun.state variables. */
  responseMapping: z.record(z.string()).default({}),
});

const AssignAgentData = z.object({
  /** Optional team/queue to route to; null = general queue. */
  team: z.string().nullable().default(null),
  note: z.string().optional(),
});

const DelayData = z.object({
  seconds: z.number().int().positive(),
});

/** AI-powered reply: Claude answers the customer using the conversation +
 *  optional knowledge base. The generated text is sent and may be stored. */
const AiReplyData = z.object({
  /** Persona / instructions for the assistant. */
  systemPrompt: z.string().default(
    "You are a helpful WhatsApp support assistant. Reply concisely.",
  ),
  /** Optional knowledge-base text the model may answer from. */
  knowledge: z.string().optional(),
  /** Anthropic model id; defaults to the platform default if blank. */
  model: z.string().optional(),
  maxTokens: z.number().int().positive().max(4096).default(512),
  /** Optionally store the AI reply in a variable / contact field. */
  saveToVariable: z.string().optional(),
});

const EndData = z.object({});

// ── Discriminated node union ────────────────────────────────────────────

const baseNode = { id: z.string(), position: PositionSchema };

export const FlowNodeSchema = z.discriminatedUnion("type", [
  z.object({ ...baseNode, type: z.literal("trigger"), data: TriggerData }),
  z.object({ ...baseNode, type: z.literal("sendMessage"), data: SendMessageData }),
  z.object({ ...baseNode, type: z.literal("askQuestion"), data: AskQuestionData }),
  z.object({ ...baseNode, type: z.literal("condition"), data: ConditionData }),
  z.object({ ...baseNode, type: z.literal("setAttribute"), data: SetAttributeData }),
  z.object({ ...baseNode, type: z.literal("addTag"), data: AddTagData }),
  z.object({ ...baseNode, type: z.literal("httpRequest"), data: HttpRequestData }),
  z.object({ ...baseNode, type: z.literal("assignAgent"), data: AssignAgentData }),
  z.object({ ...baseNode, type: z.literal("aiReply"), data: AiReplyData }),
  z.object({ ...baseNode, type: z.literal("delay"), data: DelayData }),
  z.object({ ...baseNode, type: z.literal("end"), data: EndData }),
]);
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const FlowGraphSchema = z.object({
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
});
export type FlowGraph = z.infer<typeof FlowGraphSchema>;

/**
 * Structural validation beyond shape: exactly one trigger, no edges to
 * missing nodes. Returns a list of human-readable problems (empty = valid).
 */
export function validateFlowGraph(graph: FlowGraph): string[] {
  const problems: string[] = [];
  const triggers = graph.nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) problems.push("Flow has no trigger node.");
  if (triggers.length > 1) problems.push("Flow has more than one trigger node.");

  // A keyword trigger with no keywords can never match an inbound message, so the
  // flow would publish but silently never run. Catch it here with a clear message.
  const trig = triggers[0];
  if (trig && trig.type === "trigger") {
    const d = trig.data;
    if (d.mode === "keyword" && d.keywords.filter((k) => k.trim()).length === 0) {
      problems.push(
        "Add at least one trigger keyword, or switch the trigger to “any message”.",
      );
    }
  }

  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.source)) problems.push(`Edge ${e.id} starts at a missing node.`);
    if (!ids.has(e.target)) problems.push(`Edge ${e.id} ends at a missing node.`);
  }
  return problems;
}
