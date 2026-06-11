import { prisma, Prisma } from "@watool/db";
import { createWhatsAppClient, type WhatsAppClient } from "@watool/wa";
import {
  FlowGraphSchema,
  canHandleConversations,
  type FlowGraph,
  type FlowNode,
} from "@watool/types";
import { generateAiReply, isAiConfigured, type AiTurn } from "./ai";

/** If the org has auto-assign on, return the handleable member with the fewest
 *  open conversations; otherwise null (leave unassigned). */
async function pickAutoAssignee(orgId: string): Promise<string | null> {
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { autoAssign: true },
  });
  if (!settings?.autoAssign) return null;

  const members = (
    await prisma.membership.findMany({ where: { orgId }, select: { userId: true, role: true } })
  ).filter((m) => canHandleConversations(m.role));
  if (members.length === 0) return null;

  const loads = await Promise.all(
    members.map(async (m) => ({
      userId: m.userId,
      count: await prisma.conversation.count({
        where: { orgId, assignedUserId: m.userId, status: { in: ["AGENT", "OPEN"] } },
      }),
    })),
  );
  loads.sort((a, b) => a.count - b.count);
  return loads[0]?.userId ?? null;
}

/**
 * Flow execution engine — an event-driven state machine (ARCHITECTURE §8.2).
 * It is NOT a long-running loop: it executes nodes until it hits one that WAITS
 * (askQuestion) or ENDS, persists `currentNodeId` + `state`, and stops. The next
 * inbound message resumes it. This is essential because a bot may wait minutes
 * or days for a human reply.
 */

export type EngineContext = {
  orgId: string;
  conversation: { id: string; status: string; windowExpiresAt: Date | null };
  contact: { id: string; waId: string; attributes: Record<string, unknown> };
  phoneNumberId: string;
  accessToken: string; // already decrypted
  inboundText: string | undefined;
};

const MAX_STEPS = 50; // guard against cycles in a single turn

export async function runFlowsForInbound(
  ctx: EngineContext,
): Promise<{ handled: boolean }> {
  const client = createWhatsAppClient({
    phoneNumberId: ctx.phoneNumberId,
    accessToken: ctx.accessToken,
  });

  // 1. Resume an active run that is waiting at an askQuestion node.
  const run = await prisma.flowRun.findFirst({
    where: { conversationId: ctx.conversation.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (run) {
    const version = await prisma.flowVersion.findUnique({
      where: { id: run.flowVersionId },
    });
    const graph = parseGraph(version?.graphJSON);
    const waiting = graph?.nodes.find((n) => n.id === run.currentNodeId);
    if (graph && waiting) {
      if (waiting.type === "askQuestion") {
        await resumeAtquestion(ctx, client, graph, run, waiting);
        return { handled: true };
      }
      // A buttons message also waits: the inbound reply is the tapped button.
      if (
        waiting.type === "sendMessage" &&
        waiting.data.bodyType === "buttons" &&
        waiting.data.buttons.length > 0
      ) {
        await resumeAtButtons(ctx, client, graph, run, waiting);
        return { handled: true };
      }
    }
  }

  // 2. No active run — match a published flow's trigger.
  const flows = await prisma.flow.findMany({
    where: { orgId: ctx.orgId, status: "PUBLISHED" },
    include: {
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  for (const flow of flows) {
    const version = flow.versions[0];
    const graph = parseGraph(version?.graphJSON);
    if (!graph || !version) continue;
    const trigger = graph.nodes.find((n) => n.type === "trigger");
    if (!trigger || trigger.type !== "trigger") continue;
    if (!matchesTrigger(trigger.data, ctx.inboundText)) continue;

    const newRun = await prisma.flowRun.create({
      data: {
        orgId: ctx.orgId,
        flowId: flow.id,
        flowVersionId: version.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversation.id,
        state: {},
        status: "ACTIVE",
      },
    });
    const first = nextNode(graph, trigger.id);
    await execute(ctx, client, graph, newRun.id, first, {});
    return { handled: true };
  }

  return { handled: false };
}

/**
 * Force-run a specific flow on a conversation, bypassing trigger matching. Used
 * by the "Run flow" action in the inbox so an agent can kick off (or test) a bot
 * flow on demand. Prefers the published version; falls back to the latest draft
 * so unpublished flows can be tried too. Any other active run on the
 * conversation is closed so this manual run becomes the authoritative one.
 */
export async function startFlowForConversation(
  ctx: EngineContext,
  flowId: string,
): Promise<{ started: boolean; error?: string }> {
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, orgId: ctx.orgId },
  });
  if (!flow) return { started: false, error: "Flow not found." };

  const version =
    (await prisma.flowVersion.findFirst({
      where: { flowId, publishedAt: { not: null } },
      orderBy: { version: "desc" },
    })) ??
    (await prisma.flowVersion.findFirst({
      where: { flowId },
      orderBy: { version: "desc" },
    }));
  if (!version) return { started: false, error: "This flow has no saved version yet." };

  const graph = parseGraph(version.graphJSON);
  if (!graph) return { started: false, error: "This flow's graph is invalid." };
  const trigger = graph.nodes.find((n) => n.type === "trigger");
  if (!trigger) return { started: false, error: "This flow has no trigger node." };

  const client = createWhatsAppClient({
    phoneNumberId: ctx.phoneNumberId,
    accessToken: ctx.accessToken,
  });

  await prisma.flowRun.updateMany({
    where: { conversationId: ctx.conversation.id, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });

  const run = await prisma.flowRun.create({
    data: {
      orgId: ctx.orgId,
      flowId: flow.id,
      flowVersionId: version.id,
      contactId: ctx.contact.id,
      conversationId: ctx.conversation.id,
      state: {},
      status: "ACTIVE",
    },
  });
  const first = nextNode(graph, trigger.id);
  await execute(ctx, client, graph, run.id, first, {});
  return { started: true };
}

// ── Resume at an Ask node: the inbound message is the answer ────────────────

async function resumeAtquestion(
  ctx: EngineContext,
  client: WhatsAppClient,
  graph: FlowGraph,
  run: { id: string; state: unknown },
  node: Extract<FlowNode, { type: "askQuestion" }>,
): Promise<void> {
  const state = (run.state as Record<string, unknown>) ?? {};
  const answer = ctx.inboundText ?? "";

  if (!isValid(node.data.validation, node.data.regex, answer)) {
    await send(ctx, client, node.data.retryMessage ?? "Sorry, that doesn't look right. Please try again.");
    return; // stay on the same node, wait again
  }

  // Save the answer to the flow's working state AND persist it onto the contact
  // as a variable (custom field) so it's visible in Contacts and reusable later.
  state[node.data.variable] = answer;
  ctx.contact.attributes[node.data.variable] = answer;
  await prisma.flowRun.update({
    where: { id: run.id },
    data: { state: state as Prisma.InputJsonValue },
  });
  await prisma.contact.update({
    where: { id: ctx.contact.id },
    data: { attributes: ctx.contact.attributes as Prisma.InputJsonValue },
  });
  await execute(ctx, client, graph, run.id, nextNode(graph, node.id), state);
}

// ── Resume after a buttons message: the inbound reply is the tapped button ──

async function resumeAtButtons(
  ctx: EngineContext,
  client: WhatsAppClient,
  graph: FlowGraph,
  run: { id: string; state: unknown },
  node: Extract<FlowNode, { type: "sendMessage" }>,
): Promise<void> {
  const state = (run.state as Record<string, unknown>) ?? {};
  const a = (ctx.inboundText ?? "").toLowerCase().trim();
  const btn = node.data.buttons.find(
    (b) => b.id.toLowerCase() === a || b.label.toLowerCase().trim() === a,
  );

  // Route via the tapped button's handle; if unmatched, follow a fallback edge
  // (sourceHandle = null), else the flow ends.
  const target =
    (btn && edgeTargetExact(graph, node.id, btn.id)) ??
    edgeTargetExact(graph, node.id, null);
  await execute(ctx, client, graph, run.id, target, state);
}

// ── Core executor: run nodes until a wait/end ───────────────────────────────

async function execute(
  ctx: EngineContext,
  client: WhatsAppClient,
  graph: FlowGraph,
  runId: string,
  startNode: FlowNode | undefined,
  state: Record<string, unknown>,
): Promise<void> {
  let node = startNode;
  let steps = 0;

  while (node && steps++ < MAX_STEPS) {
    switch (node.type) {
      case "sendMessage": {
        await sendNode(ctx, client, node, state);
        // A buttons message pauses the run until the customer taps a button.
        if (node.data.bodyType === "buttons" && node.data.buttons.length > 0) {
          await prisma.flowRun.update({
            where: { id: runId },
            data: { currentNodeId: node.id, state: state as Prisma.InputJsonValue, status: "ACTIVE" },
          });
          return;
        }
        node = nextNode(graph, node.id);
        break;
      }
      case "askQuestion": {
        const prompt = interpolate(node.data.prompt, state, ctx.contact.attributes);
        const quick = node.data.buttons ?? [];
        if (quick.length > 0) {
          await sendButtons(ctx, client, prompt, quick.map((b) => ({ id: b.id, title: b.label })));
        } else {
          await send(ctx, client, prompt);
        }
        await prisma.flowRun.update({
          where: { id: runId },
          data: { currentNodeId: node.id, state: state as Prisma.InputJsonValue, status: "ACTIVE" },
        });
        return; // WAIT for the next inbound message (typed or a tapped quick-reply)
      }
      case "condition": {
        const handle = evalCondition(node, state, ctx.contact.attributes);
        node = nextNode(graph, node.id, handle);
        break;
      }
      case "setAttribute": {
        const value = interpolate(node.data.value, state, ctx.contact.attributes);
        ctx.contact.attributes[node.data.attribute] = value;
        await prisma.contact.update({
          where: { id: ctx.contact.id },
          data: { attributes: ctx.contact.attributes as Prisma.InputJsonValue },
        });
        node = nextNode(graph, node.id);
        break;
      }
      case "addTag": {
        await applyTags(ctx.orgId, ctx.contact.id, node.data.tags);
        node = nextNode(graph, node.id);
        break;
      }
      case "assignAgent": {
        const assignee = await pickAutoAssignee(ctx.orgId);
        await prisma.conversation.update({
          where: { id: ctx.conversation.id },
          data: { status: "AGENT", lastMessageAt: new Date(), ...(assignee ? { assignedUserId: assignee } : {}) },
        });
        // Drop an internal system note so agents can see the handover (+ context).
        const note = node.data.note?.trim();
        await prisma.message.create({
          data: {
            orgId: ctx.orgId,
            conversationId: ctx.conversation.id,
            direction: "OUT",
            type: "system",
            payload: {
              internal: true,
              text: { body: note ? `🤝 Handed over to a human — ${note}` : "🤝 Handed over to a human" },
            },
            status: "SENT",
          },
        });
        await prisma.flowRun.update({
          where: { id: runId },
          data: { status: "COMPLETED", currentNodeId: node.id, state: state as Prisma.InputJsonValue },
        });
        return; // hand off to a human; bot stops
      }
      case "httpRequest": {
        await runHttp(node, state);
        node = nextNode(graph, node.id);
        break;
      }
      case "aiReply": {
        await aiReplyNode(ctx, client, node, state);
        node = nextNode(graph, node.id);
        break;
      }
      case "delay": {
        // MVP: timed waits need a scheduler (deferred). Continue immediately.
        node = nextNode(graph, node.id);
        break;
      }
      case "trigger": {
        node = nextNode(graph, node.id);
        break;
      }
      case "end":
      default: {
        node = undefined;
        break;
      }
    }
  }

  // Ran off the end (or hit `end`) → complete the run.
  await prisma.flowRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", state: state as Prisma.InputJsonValue },
  });
}

// ── Node helpers ────────────────────────────────────────────────────────────

async function sendNode(
  ctx: EngineContext,
  client: WhatsAppClient,
  node: Extract<FlowNode, { type: "sendMessage" }>,
  state: Record<string, unknown>,
): Promise<void> {
  const text = interpolate(node.data.text, state, ctx.contact.attributes);
  const bt = node.data.bodyType;
  if ((bt === "image" || bt === "document" || bt === "video") && node.data.mediaUrl) {
    await sendMedia(ctx, client, bt, node.data.mediaUrl, text || undefined);
  } else if (bt === "buttons" && node.data.buttons.length > 0) {
    await sendButtons(
      ctx,
      client,
      text,
      node.data.buttons.map((b) => ({ id: b.id, title: b.label })),
    );
  } else {
    await send(ctx, client, text);
  }
}

/** Send media by public link (flow sendMessage node) + persist. Window-aware. */
async function sendMedia(
  ctx: EngineContext,
  client: WhatsAppClient,
  kind: "image" | "document" | "video",
  link: string,
  caption: string | undefined,
): Promise<void> {
  const out = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: ctx.conversation.id,
      direction: "OUT",
      type: kind,
      payload: { [kind]: { link }, ...(caption ? { caption } : {}), viaFlow: true },
      status: "QUEUED",
    },
  });
  try {
    const r = await client.sendMediaByLink(ctx.contact.waId, kind, link, caption, ctx.conversation.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: "FAILED", errorJSON: { message: err instanceof Error ? err.message : String(err) } },
    });
  }
}

/** AI node: Claude answers using the conversation history + optional knowledge. */
async function aiReplyNode(
  ctx: EngineContext,
  client: WhatsAppClient,
  node: Extract<FlowNode, { type: "aiReply" }>,
  state: Record<string, unknown>,
): Promise<void> {
  if (!isAiConfigured()) {
    await send(ctx, client, "Our AI assistant isn't available right now. An agent will follow up.");
    return;
  }

  // Recent conversation as chat history (oldest → newest).
  const recent = await prisma.message.findMany({
    where: { conversationId: ctx.conversation.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const history: AiTurn[] = recent
    .map((m) => ({
      role: (m.direction === "IN" ? "user" : "assistant") as AiTurn["role"],
      text: messageText(m.payload),
    }))
    .filter((t) => t.text.length > 0);

  // Ensure the just-received message is the final user turn.
  const lastUser = [...history].reverse().find((t) => t.role === "user");
  if (ctx.inboundText && lastUser?.text !== ctx.inboundText) {
    history.push({ role: "user", text: ctx.inboundText });
  }

  let reply: string;
  try {
    reply = await generateAiReply({
      systemPrompt: node.data.systemPrompt,
      knowledge: node.data.knowledge,
      model: node.data.model || undefined,
      maxTokens: node.data.maxTokens,
      history,
    });
  } catch (err) {
    console.error("[engine] AI reply failed:", err instanceof Error ? err.message : err);
    await send(ctx, client, "Sorry, I'm having trouble answering right now. An agent will follow up.");
    return;
  }

  await send(ctx, client, reply);

  // Optionally persist the AI answer as a variable / contact field.
  if (node.data.saveToVariable) {
    state[node.data.saveToVariable] = reply;
    ctx.contact.attributes[node.data.saveToVariable] = reply;
    await prisma.contact.update({
      where: { id: ctx.contact.id },
      data: { attributes: ctx.contact.attributes as Prisma.InputJsonValue },
    });
  }
}

/** Best-effort text extraction from a stored message payload. */
function messageText(payload: unknown): string {
  const p = payload as
    | { text?: { body?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string } }
    | null;
  return (
    p?.text?.body ??
    p?.interactive?.button_reply?.title ??
    p?.interactive?.list_reply?.title ??
    p?.button?.text ??
    ""
  );
}

/** Send free-form text + persist the outbound message. Window-aware. */
async function send(ctx: EngineContext, client: WhatsAppClient, text: string): Promise<void> {
  const out = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: ctx.conversation.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body: text }, viaFlow: true },
      status: "QUEUED",
    },
  });
  try {
    const r = await client.sendText(ctx.contact.waId, text, ctx.conversation.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: "FAILED", errorJSON: { message: err instanceof Error ? err.message : String(err) } },
    });
  }
}

async function sendButtons(
  ctx: EngineContext,
  client: WhatsAppClient,
  text: string,
  buttons: { id: string; title: string }[],
): Promise<void> {
  const out = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: ctx.conversation.id,
      direction: "OUT",
      type: "interactive",
      payload: { text: { body: text }, buttons, viaFlow: true },
      status: "QUEUED",
    },
  });
  try {
    const r = await client.sendButtons(ctx.contact.waId, text, buttons, ctx.conversation.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: "FAILED", errorJSON: { message: err instanceof Error ? err.message : String(err) } },
    });
  }
}

async function applyTags(orgId: string, contactId: string, tags: string[]): Promise<void> {
  for (const name of tags) {
    const tag = await prisma.tag.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name },
      update: {},
    });
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: { contactId, tagId: tag.id },
      update: {},
    });
  }
}

async function runHttp(
  node: Extract<FlowNode, { type: "httpRequest" }>,
  state: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(node.data.url, {
      method: node.data.method,
      headers: node.data.headers,
      ...(node.data.body ? { body: node.data.body } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [variable, path] of Object.entries(node.data.responseMapping)) {
      state[variable] = getPath(json, path);
    }
  } catch {
    /* best-effort; flows shouldn't crash on a flaky API */
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function parseGraph(json: unknown): FlowGraph | null {
  const parsed = FlowGraphSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Follow the outgoing edge (optionally by source handle) to the next node. */
function nextNode(graph: FlowGraph, fromId: string, sourceHandle?: string): FlowNode | undefined {
  const edge = graph.edges.find(
    (e) =>
      e.source === fromId &&
      (sourceHandle === undefined || e.sourceHandle === sourceHandle),
  );
  if (!edge) return undefined;
  return graph.nodes.find((n) => n.id === edge.target);
}

/** Follow the edge whose sourceHandle matches EXACTLY (null = the default edge). */
function edgeTargetExact(
  graph: FlowGraph,
  fromId: string,
  handle: string | null,
): FlowNode | undefined {
  const edge = graph.edges.find(
    (e) => e.source === fromId && (e.sourceHandle ?? null) === handle,
  );
  if (!edge) return undefined;
  return graph.nodes.find((n) => n.id === edge.target);
}

function matchesTrigger(
  data: Extract<FlowNode, { type: "trigger" }>["data"],
  text: string | undefined,
): boolean {
  if (data.mode === "anyMessage") return true;
  if (data.mode === "keyword") {
    if (!text) return false;
    const hay = text.toLowerCase().trim();
    return data.keywords.some((k) => {
      const needle = k.toLowerCase().trim();
      return data.matchType === "exact" ? hay === needle : hay.includes(needle);
    });
  }
  return false; // optIn / buttonClick handled elsewhere later
}

function evalCondition(
  node: Extract<FlowNode, { type: "condition" }>,
  state: Record<string, unknown>,
  attributes: Record<string, unknown>,
): string {
  for (const rule of node.data.rules) {
    const actual = state[rule.variable] ?? attributes[rule.variable];
    if (ruleMatches(rule.op, actual, rule.value)) return rule.targetHandle;
  }
  return node.data.defaultHandle;
}

function ruleMatches(op: string, actual: unknown, value: string | undefined): boolean {
  const a = actual == null ? "" : String(actual);
  const v = value ?? "";
  switch (op) {
    case "eq": return a === v;
    case "neq": return a !== v;
    case "contains": return a.toLowerCase().includes(v.toLowerCase());
    case "gt": return Number(a) > Number(v);
    case "lt": return Number(a) < Number(v);
    case "exists": return actual != null && a !== "";
    case "notExists": return actual == null || a === "";
    default: return false;
  }
}

function isValid(validation: string, regex: string | undefined, text: string): boolean {
  const t = text.trim();
  switch (validation) {
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    case "number": return /^-?\d+(\.\d+)?$/.test(t);
    case "phone": return /^\+?[0-9 ()-]{6,}$/.test(t);
    case "regex": return regex ? safeRegex(regex, t) : true;
    case "none":
    default: return t.length > 0;
  }
}

function safeRegex(pattern: string, text: string): boolean {
  try { return new RegExp(pattern).test(text); } catch { return true; }
}

/** Replace {{var}} with state vars, then contact attributes. */
function interpolate(
  template: string,
  state: Record<string, unknown>,
  attributes: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = state[key] ?? attributes[key];
    return v == null ? "" : String(v);
  });
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}
