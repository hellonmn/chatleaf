"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canManageOrg, planLimits } from "@watool/types";
import { sendBroadcast, audienceWhere, type AudienceFilter } from "@watool/processing";
import { requireActiveContext } from "@/lib/session";
import { startOfMonth } from "@/lib/usage";

export type ActionState = { error?: string; ok?: string } | undefined;

const filterSchema = z.object({
  optedInOnly: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  stages: z.array(z.enum(["NEW", "QUALIFIED", "ENGAGED", "CONVERTED"])).optional(),
  source: z.string().trim().optional(),
  lastActiveDays: z.number().int().nonnegative().optional(),
});

function parseFilter(raw: FormDataEntryValue | null): AudienceFilter {
  if (typeof raw !== "string" || !raw.trim()) return { optedInOnly: true };
  try {
    const parsed = filterSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { optedInOnly: true };
  } catch {
    return { optedInOnly: true };
  }
}

/** Live audience size for the segment builder (called from the client). */
export async function estimateAudienceAction(filter: AudienceFilter): Promise<number> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return 0;
  const safe = filterSchema.safeParse(filter);
  return prisma.contact.count({
    where: audienceWhere(ctx.orgId, safe.success ? safe.data : { optedInOnly: true }),
  });
}

/** Create a broadcast (DRAFT) with an audience segment, then open its page. */
export async function createBroadcastAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;

  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;
  const filter = parseFilter(formData.get("filter"));

  // Template must be an approved template belonging to this org.
  const template = await prisma.template.findFirst({
    where: { id: templateId, orgId: ctx.orgId },
  });
  if (!template) return;

  const segment = await prisma.segment.create({
    data: {
      orgId: ctx.orgId,
      name: `Audience for ${template.name}`,
      filterJSON: filter as Prisma.InputJsonValue,
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

/** Count contacts a broadcast's segment would reach. */
async function estimateAudience(orgId: string, segmentId: string | null): Promise<number> {
  const filter = segmentId
    ? ((await prisma.segment.findUnique({ where: { id: segmentId } }))?.filterJSON as
        | AudienceFilter
        | undefined)
    : undefined;
  return prisma.contact.count({ where: audienceWhere(orgId, filter) });
}

export async function deleteBroadcastAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const id = String(formData.get("broadcastId") ?? "");
  await prisma.broadcast.deleteMany({ where: { id, orgId: ctx.orgId } });
  revalidatePath("/dashboard/broadcasts");
}

/** Schedule a broadcast to auto-send later (the cron endpoint dispatches it). */
export async function scheduleBroadcastAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "No permission." };

  const broadcastId = String(formData.get("broadcastId") ?? "");
  const iso = String(formData.get("scheduleAt") ?? "");
  const when = new Date(iso);
  if (!iso || Number.isNaN(when.getTime())) return { error: "Pick a valid date & time." };
  if (when.getTime() < Date.now() + 60_000) return { error: "Pick a time at least a minute from now." };

  const b = await prisma.broadcast.findFirst({ where: { id: broadcastId, orgId: ctx.orgId } });
  if (!b) return { error: "Broadcast not found." };
  if (b.status === "RUNNING" || b.status === "COMPLETED") return { error: "This broadcast was already sent." };

  await prisma.broadcast.update({
    where: { id: b.id },
    data: { status: "SCHEDULED", scheduleAt: when },
  });
  revalidatePath(`/dashboard/broadcasts/${b.id}`);
  revalidatePath("/dashboard/broadcasts");
  return { ok: "Scheduled." };
}

/** Cancel a pending schedule (back to DRAFT). */
export async function cancelScheduleAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const id = String(formData.get("broadcastId") ?? "");
  await prisma.broadcast.updateMany({
    where: { id, orgId: ctx.orgId, status: "SCHEDULED" },
    data: { status: "DRAFT", scheduleAt: null },
  });
  revalidatePath(`/dashboard/broadcasts/${id}`);
  revalidatePath("/dashboard/broadcasts");
}
