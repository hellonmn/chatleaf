import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { FlowGraphSchema, type FlowGraph } from "@watool/types";
import { FlowBuilder } from "./FlowBuilder";

export default async function FlowBuilderPage({
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
  const graph: FlowGraph = parsed?.success
    ? parsed.data
    : { nodes: [], edges: [] };

  // Known variables = existing contact custom-field keys + every askQuestion
  // variable used across this org's flows. Offered as suggestions in the builder.
  const [contacts, versions] = await Promise.all([
    prisma.contact.findMany({
      where: { orgId: ctx.orgId },
      select: { attributes: true },
      take: 500,
    }),
    prisma.flowVersion.findMany({
      where: { flow: { orgId: ctx.orgId } },
      select: { graphJSON: true },
    }),
  ]);
  const vars = new Set<string>();
  for (const c of contacts) {
    for (const k of Object.keys((c.attributes as Record<string, unknown>) ?? {})) vars.add(k);
  }
  for (const v of versions) {
    const g = FlowGraphSchema.safeParse(v.graphJSON);
    if (!g.success) continue;
    for (const n of g.data.nodes) {
      if (n.type === "askQuestion") vars.add(n.data.variable);
    }
  }

  return (
    <FlowBuilder
      flowId={flow.id}
      name={flow.name}
      status={flow.status}
      initialGraph={graph}
      knownVariables={[...vars].filter(Boolean).sort()}
    />
  );
}
