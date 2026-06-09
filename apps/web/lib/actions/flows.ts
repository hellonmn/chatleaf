"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@watool/db";
import {
  FlowGraphSchema,
  validateFlowGraph,
  canManageOrg,
  planLimits,
  type FlowGraph,
} from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type SaveState = { error?: string; ok?: string } | undefined;

/** A brand-new flow opens with a single keyword trigger node. */
function starterGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: "trigger-" + randomBytes(3).toString("hex"),
        type: "trigger",
        position: { x: 280, y: 40 },
        data: { mode: "keyword", keywords: [], matchType: "contains" },
      },
    ],
    edges: [],
  };
}

/** Create a flow (+ its first draft version) and open the builder. */
export async function createFlowAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const name = String(formData.get("name") ?? "").trim() || "Untitled flow";

  const flow = await prisma.flow.create({
    data: {
      orgId: ctx.orgId,
      name,
      status: "DRAFT",
      versions: {
        create: { version: 1, graphJSON: starterGraph() as Prisma.InputJsonValue },
      },
    },
  });
  redirect(`/flows/${flow.id}`);
}

export async function deleteFlowAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const flowId = String(formData.get("flowId") ?? "");
  if (!flowId) return;
  await prisma.flow.deleteMany({ where: { id: flowId, orgId: ctx.orgId } });
  revalidatePath("/dashboard/flows");
}

/**
 * Ensure there's an editable DRAFT version holding `graph` and return its id.
 * If the latest version is already published, a new draft (v+1) is created so
 * the published flow keeps running unchanged (ARCHITECTURE §8.1).
 */
async function upsertDraftVersion(
  flowId: string,
  graph: FlowGraph,
): Promise<string> {
  const latest = await prisma.flowVersion.findFirst({
    where: { flowId },
    orderBy: { version: "desc" },
  });
  if (!latest) {
    const created = await prisma.flowVersion.create({
      data: { flowId, version: 1, graphJSON: graph as Prisma.InputJsonValue },
    });
    return created.id;
  }
  if (latest.publishedAt) {
    const created = await prisma.flowVersion.create({
      data: {
        flowId,
        version: latest.version + 1,
        graphJSON: graph as Prisma.InputJsonValue,
      },
    });
    return created.id;
  }
  await prisma.flowVersion.update({
    where: { id: latest.id },
    data: { graphJSON: graph as Prisma.InputJsonValue },
  });
  return latest.id;
}

async function assertOwnedFlow(orgId: string, flowId: string) {
  return prisma.flow.findFirst({ where: { id: flowId, orgId } });
}

/** Save the working graph as a draft. */
export async function saveFlowAction(
  flowId: string,
  rawGraph: unknown,
): Promise<SaveState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "No permission." };
  if (!(await assertOwnedFlow(ctx.orgId, flowId))) return { error: "Flow not found." };

  const parsed = FlowGraphSchema.safeParse(rawGraph);
  if (!parsed.success) return { error: "Invalid flow graph." };

  await upsertDraftVersion(flowId, parsed.data);
  await prisma.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
  revalidatePath(`/flows/${flowId}`);
  return { ok: "Saved draft." };
}

/** Validate + publish: snapshots the graph and makes it live for the engine. */
export async function publishFlowAction(
  flowId: string,
  rawGraph: unknown,
): Promise<SaveState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "No permission." };
  if (!(await assertOwnedFlow(ctx.orgId, flowId))) return { error: "Flow not found." };

  const parsed = FlowGraphSchema.safeParse(rawGraph);
  if (!parsed.success) return { error: "Invalid flow graph." };

  const problems = validateFlowGraph(parsed.data);
  if (problems.length > 0) return { error: problems[0] };

  // Published-flow limit (don't count this flow if it's already published).
  const alreadyPublished = await prisma.flow.findFirst({
    where: { id: flowId, status: "PUBLISHED" },
  });
  if (!alreadyPublished) {
    const publishedCount = await prisma.flow.count({
      where: { orgId: ctx.orgId, status: "PUBLISHED" },
    });
    const limit = planLimits(ctx.plan).publishedFlows;
    if (publishedCount >= limit) {
      return {
        error: `Your ${ctx.plan} plan allows ${limit} published flow(s). Upgrade in Settings → Billing.`,
      };
    }
  }

  const versionId = await upsertDraftVersion(flowId, parsed.data);
  const trigger = parsed.data.nodes.find((n) => n.type === "trigger");
  await prisma.flowVersion.update({
    where: { id: versionId },
    data: { publishedAt: new Date() },
  });
  await prisma.flow.update({
    where: { id: flowId },
    data: {
      status: "PUBLISHED",
      trigger: (trigger?.data ?? {}) as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/flows/${flowId}`);
  revalidatePath("/dashboard/flows");
  return { ok: "Published! Your bot is live." };
}
