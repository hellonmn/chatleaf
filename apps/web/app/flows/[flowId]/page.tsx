import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { FlowGraphSchema, type FlowGraph } from "@watool/types";
import { NodeFlowBuilder } from "./NodeFlowBuilder";

export const metadata = { title: "Flow editor — Chatleaf" };

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const ctx = await requireActiveContext();
  const { flowId } = await params;

  const flow = await prisma.flow.findFirst({
    where: { id: flowId, orgId: ctx.orgId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!flow) notFound();

  const latest = flow.versions[0];
  const parsed = latest ? FlowGraphSchema.safeParse(latest.graphJSON) : null;
  const graph: FlowGraph = parsed?.success ? parsed.data : { nodes: [], edges: [] };

  // Variable suggestions for Ask-question steps.
  const [contacts, versions] = await Promise.all([
    prisma.contact.findMany({ where: { orgId: ctx.orgId }, select: { attributes: true }, take: 500 }),
    prisma.flowVersion.findMany({ where: { flow: { orgId: ctx.orgId } }, select: { graphJSON: true } }),
  ]);
  const vars = new Set<string>();
  for (const c of contacts) {
    for (const k of Object.keys((c.attributes as Record<string, unknown>) ?? {})) vars.add(k);
  }
  for (const v of versions) {
    const g = FlowGraphSchema.safeParse(v.graphJSON);
    if (!g.success) continue;
    for (const n of g.data.nodes) if (n.type === "askQuestion") vars.add(n.data.variable);
  }

  const channelLabel = flow.phoneNumberId
    ? (await prisma.phoneNumber.findUnique({ where: { id: flow.phoneNumberId }, select: { displayNumber: true } }))?.displayNumber ?? "Unknown number"
    : "All channels";

  return (
    <NodeFlowBuilder
      flowId={flow.id}
      name={flow.name}
      status={flow.status}
      initialGraph={graph}
      knownVariables={[...vars].filter(Boolean).sort()}
      channelLabel={channelLabel}
    />
  );
}
