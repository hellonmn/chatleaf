"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { canManageOrg, canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type CrmState = { error?: string; ok?: string } | undefined;

const REVALIDATE = "/dashboard/crm";

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
  revalidatePath(REVALIDATE);
}

export async function deletePipelineAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const id = String(formData.get("pipelineId") ?? "");
  await prisma.pipeline.deleteMany({ where: { id, orgId: ctx.orgId } });
  revalidatePath(REVALIDATE);
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
  revalidatePath(REVALIDATE);
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
  revalidatePath(REVALIDATE);
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

  await prisma.deal.create({
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
  revalidatePath(REVALIDATE);
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
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      pipelineId: stage.pipelineId,
      status: stage.won ? "WON" : stage.lost ? "LOST" : "OPEN",
    },
  });
  revalidatePath(REVALIDATE);
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
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title,
      valuePaise: Number.isFinite(valueInr) && valueInr >= 0 ? Math.round(valueInr * 100) : deal.valuePaise,
      note,
    },
  });
  revalidatePath(REVALIDATE);
  return { ok: "Saved." };
}

export async function deleteDealAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const id = String(formData.get("dealId") ?? "");
  await prisma.deal.deleteMany({ where: { id, orgId: ctx.orgId } });
  revalidatePath(REVALIDATE);
}
