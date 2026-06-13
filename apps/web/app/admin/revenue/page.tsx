import { DollarSign, TrendingUp, CreditCard, Users } from "lucide-react";
import { prisma } from "@watool/db";
import { PLANS } from "@watool/types";
import { requirePlatformAdmin } from "@/lib/platform";
import { getPlanConfigs } from "@/lib/plan-config";
import { Card, SectionCard } from "@/components/ui/Card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function inr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default async function AdminRevenuePage() {
  await requirePlatformAdmin();
  const configs = await getPlanConfigs();

  const [activeSubs, subStatus, planGroups, signups] = await Promise.all([
    // Real recurring revenue: active subscriptions only.
    prisma.subscription.findMany({ where: { status: "active" }, select: { plan: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: true }),
    // Plan-based estimate: every non-suspended org by its current plan.
    prisma.org.groupBy({ by: ["plan"], where: { suspendedAt: null }, _count: true }),
    prisma.org.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 365 * 86_400_000) } },
      select: { createdAt: true },
    }),
  ]);

  // Real MRR from active subscriptions, per plan.
  const activeByPlan: Record<string, number> = {};
  for (const s of activeSubs) activeByPlan[s.plan] = (activeByPlan[s.plan] ?? 0) + 1;
  const rows = PLANS.filter((p) => configs[p].priceInr > 0).map((p) => {
    const count = activeByPlan[p] ?? 0;
    const unit = configs[p].priceInr;
    return { plan: p, label: configs[p].label, count, unit, subtotal: count * unit };
  });
  const mrr = rows.reduce((s, r) => s + r.subtotal, 0);
  const activeCount = activeSubs.length;
  const arpa = activeCount ? mrr / activeCount : 0;

  // Plan-based estimate (includes test-mode/manually-set plans without a sub).
  const estMrr = PLANS.reduce(
    (s, p) => s + ((planGroups.find((g) => g.plan === p)?._count ?? 0) * configs[p].priceInr),
    0,
  );

  const statusCount: Record<string, number> = {};
  for (const g of subStatus) statusCount[g.status] = g._count;
  const churned = (statusCount.cancelled ?? 0) + (statusCount.halted ?? 0);

  // Signups → last 12 months.
  const now = new Date();
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()]!, value: 0 };
  });
  const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of signups) {
    const i = idxByKey.get(`${s.createdAt.getFullYear()}-${s.createdAt.getMonth()}`);
    if (i !== undefined) buckets[i]!.value += 1;
  }
  const maxBar = Math.max(1, ...buckets.map((b) => b.value));
  const totalSignups = buckets.reduce((s, b) => s + b.value, 0);

  const stats = [
    { label: "MRR", value: inr(mrr), icon: DollarSign },
    { label: "ARR (run-rate)", value: inr(mrr * 12), icon: TrendingUp },
    { label: "Active subscriptions", value: activeCount.toLocaleString(), icon: CreditCard },
    { label: "ARPA", value: inr(arpa), icon: Users },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Revenue</h2>
        <p className="mt-0.5 text-sm text-sub">
          Real MRR from active Razorpay subscriptions. The plan-based estimate below
          also counts test-mode / manually-set paid plans.
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
        <SectionCard title="MRR by plan (active subscriptions)">
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-line pb-2 text-xs font-bold uppercase tracking-wide text-faint">
              <span>Plan</span>
              <span className="text-right">Subs</span>
              <span className="text-right">Price</span>
              <span className="text-right">MRR</span>
            </div>
            {rows.map((r) => (
              <div key={r.plan} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 text-sm">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="text-right text-sub">{r.count}</span>
                <span className="text-right text-sub">{inr(r.unit)}</span>
                <span className="text-right font-semibold text-ink">{inr(r.subtotal)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-line pt-2 text-sm">
              <span className="font-bold text-ink">Total MRR</span>
              <span className="text-right font-extrabold text-brand">{inr(mrr)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 pt-1 text-xs text-faint">
              <span>Plan-based estimate (incl. test mode)</span>
              <span className="text-right">{inr(estMrr)}</span>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Subscriptions">
            <div className="space-y-2.5 text-sm">
              <Row label="Active" value={statusCount.active ?? 0} tone="text-brand" />
              <Row label="Cancelled" value={statusCount.cancelled ?? 0} />
              <Row label="Halted (payment failed)" value={statusCount.halted ?? 0} tone="text-rose" />
              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <span className="text-sub">Churned total</span>
                <span className="font-bold text-ink">{churned}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="New workspaces — 12 months">
            <div className="mb-3 -mt-1 text-sm text-sub">{totalSignups} signups in the past year</div>
            <div className="flex h-28 items-end justify-between gap-1.5">
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
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sub">{label}</span>
      <span className={`font-bold ${tone ?? "text-ink"}`}>{value}</span>
    </div>
  );
}
