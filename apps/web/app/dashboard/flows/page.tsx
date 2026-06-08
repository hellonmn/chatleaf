import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { timeAgo } from "@/lib/format";
import { createFlowAction, deleteFlowAction } from "@/lib/actions/flows";

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-slate-100 text-slate-500",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

export default async function FlowsPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const flows = await prisma.flow.findMany({
    where: { orgId: ctx.orgId },
    include: { _count: { select: { runs: true } } },
    orderBy: { updatedAt: "desc" },
  });

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
              <Link href={`/dashboard/flows/${f.id}`} className="min-w-0 flex-1">
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
              <Link
                href={`/dashboard/flows/${f.id}`}
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
