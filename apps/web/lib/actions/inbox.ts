"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import {
  createWhatsAppClient,
  decryptSecret,
  WindowClosedError,
} from "@watool/wa";
import { canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ActionState = { error?: string; ok?: string } | undefined;

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
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    revalidatePath("/dashboard/inbox");
    return { ok: "Sent." };
  } catch (err) {
    const isWindow = err instanceof WindowClosedError;
    await prisma.message.update({
      where: { id: outbound.id },
      data: {
        status: "FAILED",
        errorJSON: { message: err instanceof Error ? err.message : String(err) },
      },
    });
    revalidatePath(`/dashboard/inbox/${convo.id}`);
    return {
      error: isWindow
        ? "The 24-hour reply window has closed. An approved template is required (coming in Phase 4)."
        : err instanceof Error
          ? err.message
          : "Failed to send.",
    };
  }
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
  revalidatePath(`/dashboard/inbox/${parsed.data.conversationId}`);
  revalidatePath("/dashboard/inbox");
}
