import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { timeAgo } from "@/lib/format";
import { createBroadcastAction, deleteBroadcastAction } from "@/lib/actions/broadcasts";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  RUNNING: "bg-sky-100 text-sky-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  DRAFT: "bg-slate-100 text-slate-500",
  FAILED: "bg-red-100 text-red-700",
};

const field =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default async function BroadcastsPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const [broadcasts, approved, tags, optedInCount] = await Promise.all([
    prisma.broadcast.findMany({
      where: { orgId: ctx.orgId },
      include: { template: true, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.template.findMany({
      where: { orgId: ctx.orgId, metaStatus: "APPROVED" },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.contact.count({ where: { orgId: ctx.orgId, optInStatus: "OPTED_IN" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Broadcasts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Send an approved template to a segment of opted-in contacts.
        </p>
      </div>

      {/* Create */}
      {manage && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">New broadcast</h2>
          {approved.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              You need at least one <strong>approved</strong> template. Go to{" "}
              <Link href="/dashboard/templates" className="underline">Templates</Link> and sync from Meta.
            </p>
          ) : (
            <form action={createBroadcastAction} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Template</label>
                <select name="templateId" className={`${field} mt-1`}>
                  {approved.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Audience tag (optional)</label>
                <select name="tag" className={`${field} mt-1`}>
                  <option value="">All opted-in ({optedInCount})</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <input type="hidden" name="optedInOnly" value="true" />
              <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Create
              </button>
            </form>
          )}
        </section>
      )}

      {/* List */}
      {broadcasts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No broadcasts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {broadcasts.map((b) => {
            const stats = (b.stats as { sent?: number; total?: number }) ?? {};
            return (
              <div key={b.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <Link href={`/dashboard/broadcasts/${b.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {b.template.name}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status] ?? STATUS_STYLE.DRAFT}`}>
                      {b.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {b._count.recipients} recipient(s)
                    {stats.sent != null ? ` · ${stats.sent} sent` : ""} · {timeAgo(b.createdAt)}
                  </div>
                </Link>
                {manage && (
                  <form action={deleteBroadcastAction}>
                    <input type="hidden" name="broadcastId" value={b.id} />
                    <button className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
