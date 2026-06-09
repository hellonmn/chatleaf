import Link from "next/link";
import { Plus, Send, CheckCheck, Eye, Sprout } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { timeAgo } from "@/lib/format";
import { Card } from "@/components/ui/Card";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "RUNNING", label: "Sending" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "COMPLETED", label: "Completed" },
  { key: "DRAFT", label: "Draft" },
] as const;

const STATUS_PILL: Record<string, string> = {
  RUNNING: "bg-brand-soft text-brand-ink",
  SCHEDULED: "bg-[#e6f1fb] text-[#3179a8]",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  DRAFT: "bg-canvas text-faint",
  FAILED: "bg-rose/10 text-rose",
};

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);
  const { status } = await searchParams;
  const active = status && status !== "all" ? status : "all";

  const recWhere = { broadcast: { orgId: ctx.orgId } };
  const [sent, delivered, read, broadcasts] = await Promise.all([
    prisma.broadcastRecipient.count({ where: { ...recWhere, status: { in: ["sent", "delivered", "read"] } } }),
    prisma.broadcastRecipient.count({ where: { ...recWhere, status: { in: ["delivered", "read"] } } }),
    prisma.broadcastRecipient.count({ where: { ...recWhere, status: "read" } }),
    prisma.broadcast.findMany({
      where: { orgId: ctx.orgId, ...(active !== "all" ? { status: active as never } : {}) },
      include: { template: true, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const cards = [
    { label: "Total sent", value: sent, icon: Send },
    { label: "Total delivered", value: delivered, icon: CheckCheck },
    { label: "Total read", value: read, icon: Eye },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Stat cards + ocean CTA */}
      <div className="grid gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-sub">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                {c.label}
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                {c.value.toLocaleString()}
              </div>
            </Card>
          );
        })}
        <div className="rounded-card bg-brand p-5 text-white shadow-card-lg">
          <div className="flex items-center gap-1.5 font-bold">
            <Sprout className="h-4 w-4" /> Reach more leads
          </div>
          <p className="mt-1 text-sm text-white/80">
            Send a personalized broadcast to a segment in minutes.
          </p>
          {manage && (
            <Link
              href="/dashboard/broadcasts/new"
              className="mt-3 inline-flex items-center gap-1.5 rounded-btn bg-white px-3 py-1.5 text-sm font-semibold text-brand-ink"
            >
              <Plus className="h-4 w-4" /> New broadcast
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Link
                key={s.key}
                href={s.key === "all" ? "/dashboard/broadcasts" : `/dashboard/broadcasts?status=${s.key}`}
                className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
                  active === s.key ? "bg-brand text-white" : "bg-canvas text-sub hover:bg-line"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          {manage && (
            <Link
              href="/dashboard/broadcasts/new"
              className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark"
            >
              <Plus className="h-4 w-4" /> New broadcast
            </Link>
          )}
        </div>

        {broadcasts.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-faint">No broadcasts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                  <th className="px-5 py-2.5 font-semibold">Campaign</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Template</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Audience</th>
                  <th className="px-3 py-2.5 font-semibold">Progress</th>
                  <th className="px-5 py-2.5 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => {
                  const stats = (b.stats as { sent?: number; total?: number }) ?? {};
                  const total = stats.total ?? b._count.recipients;
                  const pct = total ? Math.round(((stats.sent ?? 0) / total) * 100) : 0;
                  return (
                    <tr key={b.id} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/broadcasts/${b.id}`} className="font-semibold text-ink hover:text-brand">
                          {b.template.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[b.status] ?? STATUS_PILL.DRAFT}`}>
                          {b.status === "RUNNING" ? "sending" : b.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-sub">{b.template.name}</td>
                      <td className="px-3 py-3 text-right text-ink">{b._count.recipients || "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-faint">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-faint">
                        {b.status === "DRAFT" ? "—" : timeAgo(b.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
