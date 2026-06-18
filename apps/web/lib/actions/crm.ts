"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { canManageOrg, canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { publishCrm } from "@/lib/realtime";
import { ensureDefaultPipeline, logDealActivity } from "@/lib/crm";

export type CrmState = { error?: string; ok?: string } | undefined;

/** Revalidate the board route + push a realtime refresh to open boards. */
function notifyCrm(orgId: string) {
  revalidatePath("/dashboard/crm");
  publishCrm(orgId);
}

// ── Pipelines ───────────────────────────────────────────────────────────────

export async function createPipelineAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const count = await prisma.pipeline.count({ where: { orgId: ctx.orgId } });
  const pipeline = await prisma.pipeline.create({
    data: {
      orgId: ctx.orgId,
      name,
      order: count,
      stages: {
        create: [
          { orgId: ctx.orgId, name: "New", color: "#64748b", order: 0 },
          { orgId: ctx.orgId, name: "Won", color: "#10b981", order: 1, won: true },
          { orgId: ctx.orgId, name: "Lost", color: "#ef4444", order: 2, lost: true },
        ],
      },
    },
  });
  notifyCrm(ctx.orgId);
}

export async function deletePipelineAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const id = String(formData.get("pipelineId") ?? "");
  await prisma.pipeline.deleteMany({ where: { id, orgId: ctx.orgId } });
  notifyCrm(ctx.orgId);
}

// ── Stages ────────────────────────────────────────────────────────────────

export async function addStageAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const pipelineId = String(formData.get("pipelineId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || "#0e7490";
  if (!name) return;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, orgId: ctx.orgId } });
  if (!pipeline) return;
  const max = await prisma.pipelineStage.aggregate({ where: { pipelineId }, _max: { order: true } });
  await prisma.pipelineStage.create({
    data: { orgId: ctx.orgId, pipelineId, name, color, order: (max._max.order ?? -1) + 1 },
  });
  notifyCrm(ctx.orgId);
}

/** Delete a stage. Blocked while it still holds deals, to avoid losing them. */
export async function deleteStageAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "No permission." };
  const stageId = String(formData.get("stageId") ?? "");
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId } });
  if (!stage) return { error: "Stage not found." };
  const deals = await prisma.deal.count({ where: { stageId, orgId: ctx.orgId } });
  if (deals > 0) return { error: "Move or delete this stage's deals first." };
  await prisma.pipelineStage.delete({ where: { id: stageId } });
  notifyCrm(ctx.orgId);
  return { ok: "Stage removed." };
}

// ── Deals ─────────────────────────────────────────────────────────────────

const dealSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  contactId: z.string().optional(),
  valueInr: z.coerce.number().min(0).max(1_000_000_000).optional(),
});

export async function createDealAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const parsed = dealSchema.safeParse({
    pipelineId: formData.get("pipelineId"),
    stageId: formData.get("stageId"),
    title: formData.get("title"),
    contactId: formData.get("contactId") || undefined,
    valueInr: formData.get("valueInr") || 0,
  });
  if (!parsed.success) return { error: "Enter a deal title." };
  const { pipelineId, stageId, title, contactId, valueInr } = parsed.data;

  // Scope-check the stage belongs to this org's pipeline.
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, orgId: ctx.orgId } });
  if (!stage) return { error: "Stage not found." };
  if (contactId) {
    const c = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId }, select: { id: true } });
    if (!c) return { error: "Contact not found." };
  }

  const created = await prisma.deal.create({
    data: {
      orgId: ctx.orgId,
      pipelineId,
      stageId,
      contactId: contactId ?? null,
      title,
      valuePaise: Math.round((valueInr ?? 0) * 100),
      status: stage.won ? "WON" : stage.lost ? "LOST" : "OPEN",
    },
  });
  await logDealActivity(ctx.orgId, created.id, "created", `Created in ${stage.name}`, ctx.userId);
  notifyCrm(ctx.orgId);
  return { ok: "Deal added." };
}

/** Move a deal to another stage (drag-and-drop). Status follows won/lost stages. */
export async function moveDealAction(dealId: string, stageId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { ok: false, error: "No permission." };
  const [deal, stage] = await Promise.all([
    prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId } }),
    prisma.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId } }),
  ]);
  if (!deal || !stage) return { ok: false, error: "Not found." };
  if (deal.stageId === stageId) return { ok: true }; // no-op (dropped on same stage)
  const fromStage = await prisma.pipelineStage.findUnique({ where: { id: deal.stageId }, select: { name: true } });
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      pipelineId: stage.pipelineId,
      status: stage.won ? "WON" : stage.lost ? "LOST" : "OPEN",
    },
  });
  const verb = stage.won ? "Won" : stage.lost ? "Lost" : "stage_changed";
  await logDealActivity(
    ctx.orgId,
    dealId,
    stage.won ? "won" : stage.lost ? "lost" : "stage_changed",
    stage.won || stage.lost ? `Marked ${verb} (${stage.name})` : `Moved ${fromStage?.name ?? "?"} → ${stage.name}`,
    ctx.userId,
  );
  notifyCrm(ctx.orgId);
  return { ok: true };
}

export async function updateDealAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const dealId = String(formData.get("dealId") ?? "");
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId } });
  if (!deal) return { error: "Deal not found." };
  const title = String(formData.get("title") ?? "").trim();
  const valueInr = Number(formData.get("valueInr") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!title) return { error: "Title can't be empty." };

  // Assignee: "" clears it; otherwise the user must be a member of this org.
  const assigneeRaw = String(formData.get("assignedUserId") ?? "").trim();
  let assignedUserId: string | null = deal.assignedUserId;
  if (formData.has("assignedUserId")) {
    if (!assigneeRaw) {
      assignedUserId = null;
    } else {
      const member = await prisma.membership.findFirst({
        where: { orgId: ctx.orgId, userId: assigneeRaw },
        select: { userId: true },
      });
      assignedUserId = member ? member.userId : deal.assignedUserId;
    }
  }

  // Due date: "" clears it; an invalid date is ignored (keeps current).
  let dueDate: Date | null = deal.dueDate;
  if (formData.has("dueDate")) {
    const raw = String(formData.get("dueDate") ?? "").trim();
    if (!raw) dueDate = null;
    else {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) dueDate = d;
    }
  }

  const newValuePaise = Number.isFinite(valueInr) && valueInr >= 0 ? Math.round(valueInr * 100) : deal.valuePaise;

  await prisma.deal.update({
    where: { id: dealId },
    data: { title, valuePaise: newValuePaise, note, assignedUserId, dueDate },
  });

  // Timeline: record assignment + value changes.
  if (assignedUserId !== deal.assignedUserId) {
    if (assignedUserId) {
      const u = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { name: true, email: true } });
      await logDealActivity(ctx.orgId, dealId, "assigned", `Assigned to ${u?.name || u?.email || "a teammate"}`, ctx.userId);
    } else {
      await logDealActivity(ctx.orgId, dealId, "assigned", "Unassigned", ctx.userId);
    }
  }
  if (newValuePaise !== deal.valuePaise) {
    await logDealActivity(ctx.orgId, dealId, "value_changed", `Value set to ₹${(newValuePaise / 100).toLocaleString("en-IN")}`, ctx.userId);
  }
  notifyCrm(ctx.orgId);
  return { ok: "Saved." };
}

/** Quick "add to CRM" from the inbox/contact panel: creates a deal for the
 *  contact in the default pipeline's first stage. No pipeline/stage picker. */
export async function quickAddDealAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const valueInr = Number(formData.get("valueInr") ?? 0);
  if (!title) return { error: "Enter a deal title." };

  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId }, select: { id: true } });
  if (!contact) return { error: "Contact not found." };

  const pipeline = await ensureDefaultPipeline(ctx.orgId);
  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: pipeline.id },
    orderBy: { order: "asc" },
  });
  if (!stage) return { error: "Pipeline has no stages yet." };

  const created = await prisma.deal.create({
    data: {
      orgId: ctx.orgId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      contactId,
      title,
      valuePaise: Number.isFinite(valueInr) && valueInr > 0 ? Math.round(valueInr * 100) : 0,
      status: stage.won ? "WON" : stage.lost ? "LOST" : "OPEN",
    },
  });
  await logDealActivity(ctx.orgId, created.id, "created", "Created from the inbox", ctx.userId);
  notifyCrm(ctx.orgId);
  return { ok: "Added to CRM." };
}

export async function deleteDealAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const id = String(formData.get("dealId") ?? "");
  await prisma.deal.deleteMany({ where: { id, orgId: ctx.orgId } });
  notifyCrm(ctx.orgId);
}

/** Post a free-text note to a deal's timeline. */
export async function addDealNoteAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const dealId = String(formData.get("dealId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Write a note." };
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId }, select: { id: true } });
  if (!deal) return { error: "Deal not found." };
  await logDealActivity(ctx.orgId, dealId, "note", text.slice(0, 1000), ctx.userId);
  notifyCrm(ctx.orgId);
  return { ok: "Note added." };
}

export type DealActivityItem = { id: string; type: string; text: string; actor: string | null; createdAt: string };

/** Fetch a deal's activity timeline (newest first), with actor names resolved. */
export async function getDealActivityAction(dealId: string): Promise<DealActivityItem[]> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return [];
  const owns = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId }, select: { id: true } });
  if (!owns) return [];
  const rows = await prisma.dealActivity.findMany({
    where: { dealId, orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    text: r.text,
    actor: r.actorId ? nameById.get(r.actorId) ?? null : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
