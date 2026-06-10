"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ReplyState = { error?: string; ok?: string } | undefined;

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  shortcut: z.string().trim().max(40).optional(),
  body: z.string().trim().min(1, "Message is required").max(4096),
});

/** Normalize a shortcut: strip a leading slash, kebab-case, lowercase. */
function normShortcut(s?: string): string | null {
  if (!s) return null;
  const v = s.trim().replace(/^\//, "").replace(/\s+/g, "-").toLowerCase();
  return v || null;
}

function parse(formData: FormData) {
  return schema.safeParse({
    title: formData.get("title"),
    shortcut: (formData.get("shortcut") as string) || undefined,
    body: formData.get("body"),
  });
}

export async function createSavedReplyAction(
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "You don't have permission." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  await prisma.savedReply.create({
    data: {
      orgId: ctx.orgId,
      title: parsed.data.title,
      shortcut: normShortcut(parsed.data.shortcut),
      body: parsed.data.body,
    },
  });
  revalidatePath("/dashboard/settings/replies");
  return { ok: "Saved reply created." };
}

export async function updateSavedReplyAction(
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "You don't have permission." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing reply id." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  await prisma.savedReply.updateMany({
    where: { id, orgId: ctx.orgId },
    data: {
      title: parsed.data.title,
      shortcut: normShortcut(parsed.data.shortcut),
      body: parsed.data.body,
    },
  });
  revalidatePath("/dashboard/settings/replies");
  return { ok: "Updated." };
}

export async function deleteSavedReplyAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.savedReply.deleteMany({ where: { id, orgId: ctx.orgId } });
  revalidatePath("/dashboard/settings/replies");
}
