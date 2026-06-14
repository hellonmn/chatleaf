import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getUsage } from "@/lib/usage";
import { getPlanConfigs } from "@/lib/plan-config";
import { razorpayConfigured } from "@/lib/razorpay";
import { PlanCards } from "./PlanCards";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const over = used >= limit;
  const near = pct >= 80 && !over;
  const color = over ? "bg-red-500" : near ? "bg-amber-500" : "bg-brand";
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={over ? "font-medium text-red-600" : "text-slate-500"}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage() {
  const ctx = await requireActiveContext();
  const usage = await getUsage(ctx.orgId, ctx.plan);
  const subscription = await prisma.subscription.findUnique({ where: { orgId: ctx.orgId } });
  const billingLive = await razorpayConfigured();
  const plans = Object.values(await getPlanConfigs());
  const invoices = await prisma.invoice.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { issuedAt: "desc" },
    take: 24,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Billing &amp; usage</h1>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;re on the <strong>{usage.plan}</strong> plan.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">This month&apos;s usage</h2>
        <Meter label="Team seats" used={usage.members} limit={usage.limits.seats} />
        <Meter label="Contacts" used={usage.contacts} limit={usage.limits.contacts} />
        <Meter label="Messages sent (this month)" used={usage.messagesThisMonth} limit={usage.limits.messagesPerMonth} />
        <Meter label="Published flows" used={usage.publishedFlows} limit={usage.limits.publishedFlows} />
      </section>

      {subscription?.status === "active" && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Subscribed via Razorpay
          {subscription.currentEnd
            ? ` · renews ${subscription.currentEnd.toLocaleDateString()}`
            : ""}
          .
        </section>
      )}

      {invoices.length > 0 && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Invoices</h2>
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{inv.number}</div>
                  <div className="text-xs text-slate-400">{inv.issuedAt.toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-900">
                    ₹{(inv.total / 100).toLocaleString("en-IN")}
                  </span>
                  <a
                    href={`/dashboard/settings/billing/invoices/${inv.id}`}
                    target="_blank"
                    className="font-semibold text-brand hover:text-brand-dark"
                  >
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Plans</h2>
        <PlanCards
          plans={plans}
          currentPlan={usage.plan}
          isOwner={ctx.role === "OWNER"}
          billingLive={billingLive}
        />
      </section>
    </div>
  );
}
