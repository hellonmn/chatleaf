import { DollarSign, TrendingUp, Building2, Users } from "lucide-react";
import { prisma } from "@watool/db";
import { PLANS, PLAN_PRICING } from "@watool/types";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card, SectionCard } from "@/components/ui/Card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function AdminRevenuePage() {
  await requirePlatformAdmin();

  // MRR counts only active (non-suspended) orgs.
  const [planGroups, signups] = await Promise.all([
    prisma.org.groupBy({
      by: ["plan"],
      where: { suspendedAt: null },
      _count: true,
    }),
    prisma.org.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 365 * 86_400_000) } },
      select: { createdAt: true },
    }),
  ]);

  const countByPlan: Record<string, number> = {};
  for (const g of planGroups) countByPlan[g.plan] = g._count;

  const rows = PLANS.map((p) => {
    const count = countByPlan[p] ?? 0;
    const unit = PLAN_PRICING[p].priceUsd;
    return { plan: p, label: PLAN_PRICING[p].label, count, unit, subtotal: count * unit };
  });

  const mrr = rows.reduce((s, r) => s + r.subtotal, 0);
  const activeOrgs = rows.reduce((s, r) => s + r.count, 0);
  const payingOrgs = rows.filter((r) => r.unit > 0).reduce((s, r) => s + r.count, 0);
  const arpa = activeOrgs ? mrr / activeOrgs : 0;

  // Bucket signups into the last 12 months.
  const now = new Date();
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()]!, value: 0 };
  });
  const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of signups) {
    const k = `${s.createdAt.getFullYear()}-${s.createdAt.getMonth()}`;
    const i = idxByKey.get(k);
    if (i !== undefined) buckets[i]!.value += 1;
  }
  const maxBar = Math.max(1, ...buckets.map((b) => b.value));
  const totalSignups = buckets.reduce((s, b) => s + b.value, 0);

  const stats = [
    { label: "MRR", value: money(mrr), icon: DollarSign },
    { label: "ARR (run-rate)", value: money(mrr * 12), icon: TrendingUp },
    { label: "Paying orgs", value: payingOrgs.toLocaleString(), icon: Building2 },
    { label: "ARPA", value: money(arpa), icon: Users },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Revenue</h2>
        <p className="mt-0.5 text-sm text-sub">
          Estimated from plan pricing × active (non-suspended) workspaces. Not actual
          billing — wire up Stripe for charged revenue.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-sub">{s.label}</span>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="MRR by plan">
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-line pb-2 text-xs font-bold uppercase tracking-wide text-faint">
              <span>Plan</span>
              <span className="text-right">Orgs</span>
              <span className="text-right">Price</span>
              <span className="text-right">MRR</span>
            </div>
            {rows.map((r) => (
              <div key={r.plan} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 text-sm">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="text-right text-sub">{r.count}</span>
                <span className="text-right text-sub">{money(r.unit)}</span>
                <span className="text-right font-semibold text-ink">{money(r.subtotal)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-line pt-2 text-sm">
              <span className="font-bold text-ink">Total MRR</span>
              <span className="text-right font-extrabold text-brand">{money(mrr)}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="New workspaces — last 12 months">
          <div className="mb-3 -mt-1 text-sm text-sub">{totalSignups} signups in the past year</div>
          <div className="flex h-40 items-end justify-between gap-1.5">
            {buckets.map((b, i) => {
              const h = Math.round((b.value / maxBar) * 100);
              const isMax = b.value === maxBar && b.value > 0;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end" title={`${b.value}`}>
                    <div
                      className={`w-full rounded-t-md ${isMax ? "bg-brand" : "bg-brand-soft"}`}
                      style={{ height: `${Math.max(h, 4)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-faint">{b.label}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
