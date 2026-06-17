import { prisma } from "@watool/db";

/**
 * CRM pipeline helpers. A "pipeline" is a set of ordered stages; "deals" (cards)
 * move through them. Each org auto-gets a default Sales pipeline on first use.
 */

export const DEFAULT_PIPELINE_STAGES: { name: string; color: string; won?: boolean; lost?: boolean }[] = [
  { name: "New Lead", color: "#64748b" },
  { name: "Contacted", color: "#0ea5e9" },
  { name: "Qualified", color: "#8b5cf6" },
  { name: "Proposal", color: "#f59e0b" },
  { name: "Won", color: "#10b981", won: true },
  { name: "Lost", color: "#ef4444", lost: true },
];

/** Return the org's default pipeline, creating a seeded one if none exists. */
export async function ensureDefaultPipeline(orgId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }],
  });
  if (existing) return existing;

  return prisma.pipeline.create({
    data: {
      orgId,
      name: "Sales",
      isDefault: true,
      order: 0,
      stages: {
        create: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
          orgId,
          name: s.name,
          color: s.color,
          order: i,
          won: !!s.won,
          lost: !!s.lost,
        })),
      },
    },
  });
}

/** All pipelines for an org (for the switcher). */
export async function getPipelines(orgId: string) {
  return prisma.pipeline.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }],
  });
}

/** A pipeline's stages (ordered) with their deals (newest first within a stage). */
export async function getPipelineBoard(orgId: string, pipelineId: string) {
  return prisma.pipelineStage.findMany({
    where: { pipelineId, pipeline: { orgId } },
    orderBy: { order: "asc" },
    include: {
      deals: {
        where: { orgId },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        include: { contact: { select: { id: true, name: true, waId: true } } },
      },
    },
  });
}
