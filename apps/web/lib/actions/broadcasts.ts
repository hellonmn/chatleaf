"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canManageOrg, planLimits } from "@watool/types";
import { sendBroadcast } from "@watool/processing";
import { requireActiveContext } from "@/lib/session";
import { startOfMonth } from "@/lib/usage";

export type ActionState = { error?: string; ok?: string } | undefined;

const createSchema = z.object({
  templateId: z.string().min(1, "Pick a template"),
  optedInOnly: z.enum(["true", "false"]).default("true"),
  tag: z.string().trim().optional(),
});

/** Create a broadcast (DRAFT) with an audience segment, then open its page. */
export async function createBroadcastAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;

  const parsed = createSchema.safeParse({
    templateId: formData.get("templateId"),
    optedInOnly: formData.get("optedInOnly") ?? "true",
    tag: formData.get("tag") || undefined,
  });
  if (!parsed.success) return;

  // Template must be an approved template belonging to this org.
  const template = await prisma.template.findFirst({
    where: { id: parsed.data.templateId, orgId: ctx.orgId },
  });
  if (!template) return;

  const segment = await prisma.segment.create({
    data: {
      orgId: ctx.orgId,
      name: `Audience for ${template.name}`,
      filterJSON: {
        optedInOnly: parsed.data.optedInOnly === "true",
        ...(parsed.data.tag ? { tag: parsed.data.tag } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  const broadcast = await prisma.broadcast.create({
    data: {
      orgId: ctx.orgId,
      templateId: template.id,
      segmentId: segment.id,
      status: "DRAFT",
    },
  });

  redirect(`/dashboard/broadcasts/${broadcast.id}`);
}

/** Send the broadcast now (inline in dev; queue-backed in production). */
export async function sendBroadcastAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "No permission." };

  const broadcastId = String(formData.get("broadcastId") ?? "");
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, orgId: ctx.orgId },
  });
  if (!broadcast) return { error: "Broadcast not found." };
  if (broadcast.status === "RUNNING" || broadcast.status === "COMPLETED") {
    return { error: "This broadcast was already sent." };
  }

  // Monthly message quota: outbound already sent this month + this audience.
  const monthStart = startOfMonth();
  const [usedThisMonth, audienceSize] = await Promise.all([
    prisma.message.count({
      where: { orgId: ctx.orgId, direction: "OUT", createdAt: { gte: monthStart } },
    }),
    estimateAudience(ctx.orgId, broadcast.segmentId),
  ]);
  const quota = planLimits(ctx.plan).messagesPerMonth;
  if (usedThisMonth + audienceSize > quota) {
    return {
      error: `This send (${audienceSize}) would exceed your ${ctx.plan} monthly limit of ${quota.toLocaleString()} messages (${usedThisMonth.toLocaleString()} used). Upgrade in Settings → Billing.`,
    };
  }

  try {
    const r = await sendBroadcast(broadcastId);
    revalidatePath(`/dashboard/broadcasts/${broadcastId}`);
    revalidatePath("/dashboard/broadcasts");
    return { ok: `Sent to ${r.sent} contact(s)${r.failed ? `, ${r.failed} failed` : ""}.` };
  } catch (err) {
    revalidatePath(`/dashboard/broadcasts/${broadcastId}`);
    return { error: err instanceof Error ? err.message : "Failed to send." };
  }
}

/** Count contacts a broadcast's segment would reach (opt-in + optional tag). */
async function estimateAudience(orgId: string, segmentId: string | null): Promise<number> {
  const filter = segmentId
    ? ((await prisma.segment.findUnique({ where: { id: segmentId } }))
        ?.filterJSON as { optedInOnly?: boolean; tag?: string } | undefined)
    : undefined;
  return prisma.contact.count({
    where: {
      orgId,
      ...(filter?.optedInOnly === false ? {} : { optInStatus: "OPTED_IN" }),
      ...(filter?.tag ? { contactTags: { some: { tag: { name: filter.tag } } } } : {}),
    },
  });
}

export async function deleteBroadcastAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const id = String(formData.get("broadcastId") ?? "");
  await prisma.broadcast.deleteMany({ where: { id, orgId: ctx.orgId } });
  revalidatePath("/dashboard/broadcasts");
}
