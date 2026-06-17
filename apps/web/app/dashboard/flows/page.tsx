import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getActiveChannelId } from "@/lib/active-channel";
import { canManageOrg } from "@watool/types";
import { timeAgo } from "@/lib/format";
import { createFlowAction, createFlowFromTemplateAction, deleteFlowAction } from "@/lib/actions/flows";
import { FLOW_TEMPLATES } from "@/lib/flow-templates";
import { FeatureDisabled } from "@/components/FeatureDisabled";
import { FlowChannelSelect } from "./FlowChannelSelect";

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-slate-100 text-slate-500",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

export default async function FlowsPage() {
  const ctx = await requireActiveContext();
  if (!(await getPlatformSettings()).flowsEnabled) return <FeatureDisabled name="Automations" />;
  const manage = canManageOrg(ctx.role);
  const activeChannelId = await getActiveChannelId();

  const [flows, phones] = await Promise.all([
    prisma.flow.findMany({
      where: {
        orgId: ctx.orgId,
        ...(activeChannelId ? { OR: [{ phoneNumberId: null }, { phoneNumberId: activeChannelId }] } : {}),
      },
      include: { _count: { select: { runs: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.phoneNumber.findMany({
      where: { account: { orgId: ctx.orgId } },
      select: { id: true, displayNumber: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const channels = phones.map((p) => ({ id: p.id, label: p.displayNumber }));
  const channelLabel = (id: string | null) =>
    id ? channels.find((c) => c.id === id)?.label ?? "Unknown number" : "All channels";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Flows</h1>
          <p className="mt-1 text-sm text-slate-500">
            No-code WhatsApp chatbots. Build on a canvas, publish to go live.
          </p>
        </div>
        {manage && (
          <form action={createFlowAction} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="New flow name…"
              className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <button className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              New flow
            </button>
          </form>
        )}
      </div>

      {manage && (
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Start from a template</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW_TEMPLATES.map((t) => (
              <form key={t.key} action={createFlowFromTemplateAction}>
                <input type="hidden" name="template" value={t.key} />
                <button className="flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-brand hover:bg-brand/[0.04]">
                  <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-500">{t.description}</span>
                  <span className="mt-3 text-xs font-semibold text-brand">Use template →</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No flows yet. Create one to build your first chatbot.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {flows.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
            >
              <Link href={`/flows/${f.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {f.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[f.status] ?? STATUS_STYLE.DRAFT
                    }`}
                  >
                    {f.status.toLowerCase()}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {f._count.runs} run(s) · updated {timeAgo(f.updatedAt)}
                </div>
              </Link>
              {channels.length > 0 &&
                (manage ? (
                  <FlowChannelSelect flowId={f.id} current={f.phoneNumberId} channels={channels} />
                ) : (
                  <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs text-sub">{channelLabel(f.phoneNumberId)}</span>
                ))}
              <Link
                href={`/flows/${f.id}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                Edit
              </Link>
              {manage && (
                <form action={deleteFlowAction}>
                  <input type="hidden" name="flowId" value={f.id} />
                  <button className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
