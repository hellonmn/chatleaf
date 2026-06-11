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
import { publishInboxEvent, type WaInboundJob } from "@watool/queue";
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

  // Push a live update to any open inboxes for this org — works from both the
  // inline (web) path and the queue worker.
  if (change.messages.length || change.statuses.length) {
    publishInboxEvent(orgId);
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

  // Decrypt the access token once for the engine + auto-replies.
  const tokenEnc = phoneNumber.account.accessTokenEnc;
  const accessToken = tokenEnc ? decryptSecret(tokenEnc) : null;

  // Honour STOP/START first — even mid-agent-chat, a customer must always be
  // able to unsubscribe. This drives the opt-in filter used by broadcasts.
  const optKeyword = detectOptKeyword(inboundText);
  if (optKeyword) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optInStatus: optKeyword === "out" ? "OPTED_OUT" : "OPTED_IN" },
    });
    if (accessToken) {
      const reply =
        optKeyword === "out"
          ? "You've been unsubscribed and won't receive further messages from us. Reply START to opt back in."
          : "You're subscribed again. 🌿 Thanks — we'll keep you posted!";
      await sendAutoReply(
        orgId,
        phoneNumber.phoneNumberId,
        accessToken,
        conversation,
        msg,
        reply,
        optKeyword === "out" ? "optOut" : "optIn",
      );
    }
    return;
  }

  // First inbound from an unknown contact = implicit opt-in for service messages.
  if (contact.optInStatus === "UNKNOWN") {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optInStatus: "OPTED_IN" },
    });
  }

  // A human has taken over → bot stays quiet.
  if (conversation.status === "AGENT") return;
  if (!accessToken) {
    console.warn(`[inbound] no access token stored for ${phoneNumber.phoneNumberId}; skip reply`);
    return;
  }

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

  // Nothing matched. If the business is outside its hours and the away
  // auto-reply is on, send that; otherwise fall back to the default hello.
  if (!handled) {
    const settings = await prisma.orgSettings.findUnique({ where: { orgId } });
    const sentAway = await maybeSendAwayReply(
      orgId,
      settings,
      phoneNumber.phoneNumberId,
      accessToken,
      conversation,
      msg,
    );
    if (!sentAway) {
      await sendHelloReply(orgId, phoneNumber.phoneNumberId, accessToken, conversation, msg);
    }
  }
}

// ── STOP / START opt-out handling ───────────────────────────────────────────

const STOP_WORDS = new Set(["stop", "unsubscribe", "unsub", "optout", "opt out"]);
const START_WORDS = new Set(["start", "subscribe", "unstop", "resume", "optin", "opt in"]);

/** Detect a whole-message opt-out / opt-in keyword (avoids matching "stop by…"). */
function detectOptKeyword(text: string | undefined): "out" | "in" | null {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  if (STOP_WORDS.has(t)) return "out";
  if (START_WORDS.has(t)) return "in";
  return null;
}

/** Send a one-off system reply (opt-out/opt-in confirmation) and persist it. */
async function sendAutoReply(
  orgId: string,
  phoneNumberId: string,
  accessToken: string,
  conversation: { id: string; windowExpiresAt: Date | null },
  inbound: InboundMessage,
  text: string,
  flag: "optOut" | "optIn",
): Promise<void> {
  const client = createWhatsAppClient({ phoneNumberId, accessToken });
  const out = await prisma.message.create({
    data: {
      orgId,
      conversationId: conversation.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body: text }, [flag]: true },
      status: "QUEUED",
    },
  });
  try {
    await client.markRead(inbound.id);
    const r = await client.sendText(inbound.from, text, conversation.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: "FAILED", errorJSON: { message: err instanceof Error ? err.message : String(err) } },
    });
  }
}

// ── Business hours + away auto-reply ────────────────────────────────────────

type DayCfg = { enabled?: boolean; open?: string; close?: string };
type Hours = Record<string, DayCfg>;
type OrgHoursSettings = {
  awayEnabled: boolean;
  awayMessage: string;
  timezone: string;
  hoursJSON: unknown;
} | null;

/** Is "now" inside the org's configured open hours (in its timezone)? */
function isWithinBusinessHours(timezone: string, hours: Hours): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const wd = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().slice(0, 3);
    let hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (hh === 24) hh = 0;

    const day = hours[wd];
    if (!day || !day.enabled || !day.open || !day.close) return false;
    const cur = hh * 60 + mm;
    const [oH, oM] = day.open.split(":").map(Number);
    const [cH, cM] = day.close.split(":").map(Number);
    return cur >= oH! * 60 + oM! && cur < cH! * 60 + cM!;
  } catch {
    return true; // on any timezone error, assume open (never wrongly auto-away)
  }
}

/** Send the away message if configured + outside hours, rate-limited to once
 *  per 6h per conversation. Returns true if an away reply was sent. */
async function maybeSendAwayReply(
  orgId: string,
  settings: OrgHoursSettings,
  phoneNumberId: string,
  accessToken: string,
  conversation: { id: string; windowExpiresAt: Date | null },
  inbound: InboundMessage,
): Promise<boolean> {
  if (!settings?.awayEnabled) return false;
  const hours = (settings.hoursJSON as Hours) ?? {};
  if (isWithinBusinessHours(settings.timezone, hours)) return false;

  const recent = await prisma.message.findFirst({
    where: {
      conversationId: conversation.id,
      direction: "OUT",
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent && (recent.payload as { autoAway?: boolean })?.autoAway) return false;

  const client = createWhatsAppClient({ phoneNumberId, accessToken });
  const out = await prisma.message.create({
    data: {
      orgId,
      conversationId: conversation.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body: settings.awayMessage }, autoAway: true },
      status: "QUEUED",
    },
  });
  try {
    await client.markRead(inbound.id);
    const r = await client.sendText(inbound.from, settings.awayMessage, conversation.windowExpiresAt);
    await prisma.message.update({ where: { id: out.id }, data: { waMessageId: r.waMessageId, status: "SENT" } });
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: "FAILED", errorJSON: { message: err instanceof Error ? err.message : String(err) } },
    });
  }
  return true;
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
