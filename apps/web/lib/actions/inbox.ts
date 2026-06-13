"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import {
  createWhatsAppClient,
  decryptSecret,
  WindowClosedError,
  uploadMedia,
  mediaKindFromMime,
  describeWaError,
} from "@watool/wa";
import {
  startFlowForConversation,
  generateAiReply,
  isAiConfigured,
  type AiTurn,
} from "@watool/processing";
import { canHandleConversations } from "@watool/types";
import { notify } from "@watool/observability";
import { requireActiveContext } from "@/lib/session";
import { publishInbox } from "@/lib/realtime";
import { razorpayConfigured, createRazorpayPaymentLink } from "@/lib/razorpay";

export type ActionState = { error?: string; ok?: string } | undefined;

/** On an auth failure, flag the WhatsApp account so the UI prompts a reconnect. */
async function flagIfAuthError(orgId: string, isAuth: boolean): Promise<void> {
  if (!isAuth) return;
  // Only alert on the transition into ERROR (not on every failed send).
  const res = await prisma.whatsAppAccount
    .updateMany({ where: { orgId, status: { not: "ERROR" } }, data: { status: "ERROR" } })
    .catch(() => ({ count: 0 }));
  if (res.count > 0) {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
    await notify({
      title: "WhatsApp token expired",
      message: `${org?.name ?? orgId}'s WhatsApp access token is invalid (Meta code 190). Sends are failing until they reconnect.`,
      level: "critical",
      fields: { orgId, org: org?.name ?? "—" },
    });
  }
}

const replySchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1, "Type a message").max(4096),
});

/**
 * Agent sends a free-form reply from the inbox. Reuses the WhatsApp client so
 * the 24-hour-window rule is enforced in one place. Sending also flips the
 * conversation to AGENT (a human is handling it), which stops the bot.
 */
export async function sendReplyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) {
    return { error: "You don't have permission to reply." };
  }

  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    text: formData.get("text"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, orgId: ctx.orgId },
    include: {
      contact: true,
      phoneNumber: { include: { account: true } },
    },
  });
  if (!convo) return { error: "Conversation not found." };

  const tokenEnc = convo.phoneNumber.account.accessTokenEnc;
  if (!tokenEnc) {
    return { error: "No WhatsApp access token on file. Reconnect in Settings." };
  }

  const client = createWhatsAppClient({
    phoneNumberId: convo.phoneNumber.phoneNumberId,
    accessToken: decryptSecret(tokenEnc),
  });

  // Record the outbound attempt, then reconcile with the send result.
  const outbound = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: convo.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body: parsed.data.text }, sentByUserId: ctx.userId },
      status: "QUEUED",
    },
  });

  try {
    const result = await client.sendText(
      convo.contact.waId,
      parsed.data.text,
      convo.windowExpiresAt,
    );
    await prisma.message.update({
      where: { id: outbound.id },
      data: { waMessageId: result.waMessageId, status: "SENT" },
    });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: {
        status: "AGENT",
        assignedUserId: ctx.userId,
        lastMessageAt: new Date(),
      },
    });
    publishInbox(ctx.orgId);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    revalidatePath("/dashboard/inbox");
    return { ok: "Sent." };
  } catch (err) {
    const isWindow = err instanceof WindowClosedError;
    const { message, isAuth } = describeWaError(err);
    await prisma.message.update({
      where: { id: outbound.id },
      data: { status: "FAILED", errorJSON: { message } },
    });
    await flagIfAuthError(ctx.orgId, isAuth);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return {
      error: isWindow
        ? "The 24-hour reply window has closed — an approved template is required (send a Broadcast)."
        : message,
    };
  }
}

const paymentLinkSchema = z.object({
  conversationId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount").max(1_000_000),
  description: z.string().trim().max(200).optional(),
});

/**
 * Send a Razorpay Payment Link into a conversation. Creates the link, drops the
 * short URL as a WhatsApp message (so it lives in the chat), and records a
 * PaymentLink the payment_link.* webhook reconciles to "paid".
 */
export async function sendPaymentLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) {
    return { error: "You don't have permission to send payment links." };
  }
  if (!razorpayConfigured()) {
    return { error: "Connect Razorpay first (the RAZORPAY_* env vars)." };
  }

  const parsed = paymentLinkSchema.safeParse({
    conversationId: formData.get("conversationId"),
    amount: formData.get("amount"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Enter a valid amount." };
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, orgId: ctx.orgId },
    include: { contact: true, phoneNumber: { include: { account: true } } },
  });
  if (!convo) return { error: "Conversation not found." };
  const tokenEnc = convo.phoneNumber.account.accessTokenEnc;
  if (!tokenEnc) return { error: "No WhatsApp access token on file." };

  const amountPaise = Math.round(parsed.data.amount * 100);
  const desc = parsed.data.description || "Payment";

  let link: { id: string; short_url: string };
  try {
    link = await createRazorpayPaymentLink({
      amountPaise,
      description: desc,
      customerName: convo.contact.name,
      customerContact: `+${convo.contact.waId}`,
      notes: { orgId: ctx.orgId, conversationId: convo.id },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the payment link." };
  }

  await prisma.paymentLink.create({
    data: {
      orgId: ctx.orgId,
      conversationId: convo.id,
      contactId: convo.contactId,
      razorpayLinkId: link.id,
      shortUrl: link.short_url,
      amount: amountPaise,
      description: desc,
      createdByUserId: ctx.userId,
    },
  });

  const body = `${desc}\n💳 Pay ₹${parsed.data.amount.toLocaleString("en-IN")}: ${link.short_url}`;
  const client = createWhatsAppClient({
    phoneNumberId: convo.phoneNumber.phoneNumberId,
    accessToken: decryptSecret(tokenEnc),
  });
  const outbound = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: convo.id,
      direction: "OUT",
      type: "text",
      payload: { text: { body }, paymentLink: { id: link.id, amount: amountPaise }, sentByUserId: ctx.userId },
      status: "QUEUED",
    },
  });

  try {
    const result = await client.sendText(convo.contact.waId, body, convo.windowExpiresAt);
    await prisma.message.update({
      where: { id: outbound.id },
      data: { waMessageId: result.waMessageId, status: "SENT" },
    });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { status: "AGENT", assignedUserId: ctx.userId, lastMessageAt: new Date() },
    });
    publishInbox(ctx.orgId);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return { ok: `Payment link for ₹${parsed.data.amount.toLocaleString("en-IN")} sent.` };
  } catch (err) {
    const { message, isAuth } = describeWaError(err);
    await prisma.message.update({
      where: { id: outbound.id },
      data: { status: "FAILED", errorJSON: { message } },
    });
    await flagIfAuthError(ctx.orgId, isAuth);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return { error: message };
  }
}

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024; // 16 MB — covers WhatsApp's media caps

/** Agent sends a media attachment: upload to Meta, send by id, store + show. */
export async function sendMediaReplyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) {
    return { error: "You don't have permission to reply." };
  }

  const conversationId = String(formData.get("conversationId") ?? "");
  const caption = (formData.get("caption") as string) || undefined;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Pick a file to send." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "File is too large (16 MB max)." };
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    include: { contact: true, phoneNumber: { include: { account: true } } },
  });
  if (!convo) return { error: "Conversation not found." };
  const tokenEnc = convo.phoneNumber.account.accessTokenEnc;
  if (!tokenEnc) return { error: "No WhatsApp access token on file." };

  const token = decryptSecret(tokenEnc);
  const client = createWhatsAppClient({
    phoneNumberId: convo.phoneNumber.phoneNumberId,
    accessToken: token,
  });
  const mime = file.type || "application/octet-stream";
  const kind = mediaKindFromMime(mime);

  // Upload to Meta first to get a media id.
  let mediaId: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    mediaId = await uploadMedia({
      phoneNumberId: convo.phoneNumber.phoneNumberId,
      accessToken: token,
      data: bytes,
      mimeType: mime,
      filename: file.name,
    });
  } catch (err) {
    const { message, isAuth } = describeWaError(err);
    await flagIfAuthError(ctx.orgId, isAuth);
    return { error: message };
  }

  const outbound = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: convo.id,
      direction: "OUT",
      type: kind,
      payload: {
        [kind]: { id: mediaId, mime_type: mime, filename: file.name },
        ...(caption ? { caption } : {}),
        sentByUserId: ctx.userId,
      },
      status: "QUEUED",
    },
  });

  try {
    const result = await client.sendMediaById(
      convo.contact.waId,
      kind,
      mediaId,
      caption,
      convo.windowExpiresAt,
    );
    await prisma.message.update({
      where: { id: outbound.id },
      data: { waMessageId: result.waMessageId, status: "SENT" },
    });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { status: "AGENT", assignedUserId: ctx.userId, lastMessageAt: new Date() },
    });
    publishInbox(ctx.orgId);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return { ok: "Sent." };
  } catch (err) {
    const isWindow = err instanceof WindowClosedError;
    const { message, isAuth } = describeWaError(err);
    await prisma.message.update({
      where: { id: outbound.id },
      data: { status: "FAILED", errorJSON: { message } },
    });
    await flagIfAuthError(ctx.orgId, isAuth);
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return {
      error: isWindow
        ? "The 24-hour reply window has closed — media can't be sent now."
        : message,
    };
  }
}

/**
 * Manually run a bot flow on a conversation from the inbox. Bypasses trigger
 * matching (the agent explicitly picked it), and flips the conversation to BOT
 * so any ask-question steps can capture the customer's next reply.
 */
export async function runFlowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) {
    return { error: "You don't have permission to run flows." };
  }

  const conversationId = String(formData.get("conversationId") ?? "");
  const flowId = String(formData.get("flowId") ?? "");
  if (!conversationId || !flowId) return { error: "Pick a flow to run." };

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    include: { contact: true, phoneNumber: { include: { account: true } } },
  });
  if (!convo) return { error: "Conversation not found." };

  const tokenEnc = convo.phoneNumber.account.accessTokenEnc;
  if (!tokenEnc) {
    return { error: "No WhatsApp access token on file. Reconnect in Settings." };
  }

  // Hand the conversation back to the bot so the flow drives it.
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { status: "BOT", assignedUserId: null },
  });

  let res: { started: boolean; error?: string };
  try {
    res = await startFlowForConversation(
      {
        orgId: ctx.orgId,
        conversation: {
          id: convo.id,
          status: "BOT",
          windowExpiresAt: convo.windowExpiresAt,
        },
        contact: {
          id: convo.contact.id,
          waId: convo.contact.waId,
          attributes: (convo.contact.attributes as Record<string, unknown>) ?? {},
        },
        phoneNumberId: convo.phoneNumber.phoneNumberId,
        accessToken: decryptSecret(tokenEnc),
        inboundText: undefined,
      },
      flowId,
    );
  } catch (err) {
    const { message, isAuth } = describeWaError(err);
    await flagIfAuthError(ctx.orgId, isAuth);
    return { error: message };
  }

  if (!res.started) return { error: res.error ?? "Could not start the flow." };

  publishInbox(ctx.orgId);
  revalidatePath(`/dashboard/inbox/${convo.id}`);
  revalidatePath("/dashboard/inbox");
  return { ok: "Flow started." };
}

const statusSchema = z.object({
  conversationId: z.string().min(1),
  status: z.enum(["OPEN", "BOT", "AGENT", "CLOSED"]),
});

/** Change a conversation's status: take over (AGENT), return to bot (BOT), close. */
export async function setConversationStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;

  const parsed = statusSchema.safeParse({
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  await prisma.conversation.updateMany({
    where: { id: parsed.data.conversationId, orgId: ctx.orgId },
    data: {
      status: parsed.data.status,
      // Assign to the actor when taking over; clear on return-to-bot/close.
      assignedUserId: parsed.data.status === "AGENT" ? ctx.userId : null,
    },
  });
  publishInbox(ctx.orgId);
  revalidatePath(`/dashboard/inbox/${parsed.data.conversationId}`);
  revalidatePath("/dashboard/inbox");
}

function plainText(payload: unknown): string {
  const p = payload as
    | { text?: { body?: string }; caption?: string; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string } }
    | null;
  return (
    p?.text?.body ??
    p?.caption ??
    p?.interactive?.button_reply?.title ??
    p?.interactive?.list_reply?.title ??
    p?.button?.text ??
    ""
  );
}

/** Draft a reply suggestion with Claude from the recent conversation history. */
export async function suggestReplyAction(
  conversationId: string,
): Promise<{ text?: string; error?: string }> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "You don't have permission." };

  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: ctx.orgId },
    select: { aiApiKeyEnc: true },
  });
  const apiKey = settings?.aiApiKeyEnc ? decryptSecret(settings.aiApiKeyEnc) : undefined;
  if (!apiKey && !isAiConfigured()) {
    return { error: "Add a Claude API key in Settings → AI assistant to use suggestions." };
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!convo) return { error: "Conversation not found." };

  const recent = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const history: AiTurn[] = recent
    .map((m) => ({ role: (m.direction === "IN" ? "user" : "assistant") as AiTurn["role"], text: plainText(m.payload) }))
    .filter((t) => t.text.length > 0);
  if (history.length === 0) return { error: "Nothing to reply to yet." };

  try {
    const text = await generateAiReply({
      systemPrompt: `You are a helpful WhatsApp support agent for ${ctx.orgName}. Draft a concise, warm reply the human agent can send as-is. Reply in the customer's language. Do not invent facts, prices, or commitments.`,
      history,
      maxTokens: 400,
      apiKey,
    });
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a suggestion." };
  }
}

/** Assign a conversation to a specific teammate (empty userId = unassign). */
export async function assignConversationAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;

  const conversationId = String(formData.get("conversationId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!convo) return;

  let assignee: string | null = null;
  if (userId) {
    const member = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId },
      select: { userId: true },
    });
    if (!member) return;
    assignee = member.userId;
  }

  await prisma.conversation.update({
    where: { id: convo.id },
    // Assigning hands the chat to a human; unassigning leaves the status as-is.
    data: { assignedUserId: assignee, ...(assignee ? { status: "AGENT" } : {}) },
  });
  publishInbox(ctx.orgId);
  revalidatePath(`/dashboard/inbox/${convo.id}`);
  revalidatePath("/dashboard/inbox");
}
