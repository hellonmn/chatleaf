import Link from "next/link";
import { Building2, Users, MessageSquare, Ban, ShieldCheck, MessageCircle, AlertTriangle } from "lucide-react";
import { prisma } from "@watool/db";
import { PLANS, PLAN_PRICING } from "@watool/types";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card, SectionCard } from "@/components/ui/Card";
import { timeAgo } from "@/lib/format";

const PLAN_STYLE: Record<string, string> = {
  FREE: "bg-slate-100 text-slate-600",
  STARTER: "bg-sky/15 text-sky",
  PRO: "bg-brand-soft text-brand-ink",
};

export default async function AdminOverview() {
  await requirePlatformAdmin();

  const [orgs, suspended, users, platformAdmins, contacts, messages, planGroups, recentOrgs, waTotal, waAttention, activeSubs] =
    await Promise.all([
      prisma.org.count(),
      prisma.org.count({ where: { suspendedAt: { not: null } } }),
      prisma.user.count(),
      prisma.user.count({ where: { isPlatformAdmin: true } }),
      prisma.contact.count(),
      prisma.message.count(),
      prisma.org.groupBy({ by: ["plan"], _count: true }),
      prisma.org.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { _count: { select: { memberships: true } } },
      }),
      prisma.whatsAppAccount.count(),
      prisma.whatsAppAccount.count({
        where: {
          OR: [
            { status: { in: ["ERROR", "DISCONNECTED"] } },
            { tokenExpiresAt: { lt: new Date() } },
          ],
        },
      }),
      prisma.subscription.findMany({ where: { status: "active" }, select: { plan: true } }),
    ]);

  const planCount: Record<string, number> = {};
  for (const g of planGroups) planCount[g.plan] = g._count;
  // Real MRR (₹) from active subscriptions.
  const mrr = activeSubs.reduce((s, sub) => s + PLAN_PRICING[sub.plan].priceInr, 0);

  const stats = [
    { label: "Organizations", value: orgs, icon: Building2 },
    { label: "Users", value: users, icon: Users },
    { label: "Total messages", value: messages, icon: MessageSquare },
    { label: "Suspended", value: suspended, icon: Ban },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
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
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                {s.value.toLocaleString()}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Recent organizations"
            action={{ label: "View all", href: "/admin/orgs" }}
            bodyClassName="px-2 pb-2"
          >
            {recentOrgs.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-faint">No orgs yet.</div>
            ) : (
              recentOrgs.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orgs/${o.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand-ink">
                    {o.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
                      {o.suspendedAt && (
                        <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
                          suspended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-faint">
                      {o._count.memberships} member(s) · created {timeAgo(o.createdAt)}
                    </div>
                  </div>
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${PLAN_STYLE[o.plan]}`}>
                    {o.plan}
                  </span>
                </Link>
              ))
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Plan breakdown" action={{ label: "Revenue", href: "/admin/revenue" }}>
            <div className="space-y-3">
              {PLANS.map((p) => (
                <div key={p} className="flex items-center justify-between">
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${PLAN_STYLE[p]}`}>
                    {p}
                  </span>
                  <span className="font-bold text-ink">{planCount[p] ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm font-semibold text-sub">MRR</span>
                <span className="font-extrabold text-brand">
                  ₹{mrr.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </SectionCard>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#1da851]" />
              <span className="font-bold text-ink">WhatsApp health</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-ink">{waTotal}</span>
              <span className="text-sm text-sub">account(s)</span>
            </div>
            {waAttention > 0 ? (
              <div className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-rose">
                <AlertTriangle className="h-3.5 w-3.5" /> {waAttention} need attention
              </div>
            ) : (
              <div className="mt-1 text-sm text-sub">All healthy</div>
            )}
            <Link
              href="/admin/health"
              className="mt-2 block text-sm font-semibold text-brand hover:text-brand-dark"
            >
              View health →
            </Link>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand" />
              <span className="font-bold text-ink">Platform admins</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-ink">{platformAdmins}</div>
            <Link
              href="/admin/users"
              className="mt-2 inline-block text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Manage admins →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
