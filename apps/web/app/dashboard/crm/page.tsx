import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { ensureDefaultPipeline, getPipelines, getPipelineBoard } from "@/lib/crm";
import { PipelineBoard } from "./PipelineBoard";

export const metadata = { title: "CRM — Chatleaf" };

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const ctx = await requireActiveContext();
  const sp = await searchParams;

  // Make sure the org has at least the default pipeline.
  const def = await ensureDefaultPipeline(ctx.orgId);
  const pipelines = await getPipelines(ctx.orgId);

  const activePipeline =
    pipelines.find((p) => p.id === sp.pipeline) ?? pipelines.find((p) => p.id === def.id) ?? def;

  const [stages, contacts, memberships] = await Promise.all([
    getPipelineBoard(ctx.orgId, activePipeline.id),
    prisma.contact.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, name: true, waId: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const members = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
  }));

  return (
    <PipelineBoard
      pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
      activePipelineId={activePipeline.id}
      stages={stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        won: s.won,
        lost: s.lost,
        deals: s.deals.map((d) => ({
          id: d.id,
          title: d.title,
          valuePaise: d.valuePaise,
          status: d.status,
          note: d.note,
          assignedUserId: d.assignedUserId,
          contact: d.contact ? { id: d.contact.id, name: d.contact.name, waId: d.contact.waId } : null,
        })),
      }))}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name, waId: c.waId }))}
      members={members}
      canManage={canManageOrg(ctx.role)}
    />
  );
}
