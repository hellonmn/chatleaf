import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Play, LogIn, Trash2, AlertTriangle } from "lucide-react";
import { prisma } from "@watool/db";
import { PLANS, planLimits, PLAN_PRICING } from "@watool/types";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card, SectionCard } from "@/components/ui/Card";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EditOrgForm } from "./EditOrgForm";
import { timeAgo } from "@/lib/format";
import { actionMeta, summarizeMetadata } from "@/lib/audit-format";
import {
  setOrgPlanAction,
  suspendOrgAction,
  unsuspendOrgAction,
  deleteOrgAction,
  impersonateOrgAction,
  setOrgNotesAction,
} from "@/lib/actions/admin";

const PLAN_STYLE: Record<string, string> = {
  FREE: "bg-slate-100 text-slate-600",
  STARTER: "bg-sky/15 text-sky",
  PRO: "bg-brand-soft text-brand-ink",
};

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const over = used >= limit;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-sub">{label}</span>
        <span className={`font-semibold ${over ? "text-rose" : "text-ink"}`}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${over ? "bg-rose" : "bg-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  await requirePlatformAdmin();
  const { orgId } = await params;

  const org = await prisma.org.findUnique({
    where: { id: orgId },
    include: {
      memberships: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!org) notFound();

  const [
    contacts,
    messagesThisMonth,
    publishedFlows,
    auditEntries,
    conversations,
    flowsTotal,
    broadcasts,
    lastMessage,
  ] = await Promise.all([
    prisma.contact.count({ where: { orgId } }),
    prisma.message.count({
      where: { orgId, direction: "OUT", createdAt: { gte: startOfMonth() } },
    }),
    prisma.flow.count({ where: { orgId, status: "PUBLISHED" } }),
    prisma.adminAuditLog.findMany({
      where: { targetType: "org", targetId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.conversation.count({ where: { orgId } }),
    prisma.flow.count({ where: { orgId } }),
    prisma.broadcast.count({ where: { orgId } }),
    prisma.message.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const limits = planLimits(org.plan);
  const suspended = !!org.suspendedAt;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-1 text-sm text-sub hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All organizations
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand/10 text-base font-bold text-brand-ink">
            {org.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-ink">{org.name}</h2>
              <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${PLAN_STYLE[org.plan]}`}>
                {org.plan}
              </span>
              {suspended && (
                <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-xs font-semibold text-rose">
                  suspended
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-sub">
              /{org.slug} · {org.memberships.length} member(s)
            </div>
          </div>
        </div>
      </Card>

      {/* Snapshot */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Conversations", value: conversations.toLocaleString() },
          { label: "Flows", value: flowsTotal.toLocaleString() },
          { label: "Broadcasts", value: broadcasts.toLocaleString() },
          { label: "Last active", value: lastMessage ? timeAgo(lastMessage.createdAt) : "Never" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-sm font-medium text-sub">{s.label}</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Usage */}
        <SectionCard title="Usage vs plan">
          <div className="space-y-4">
            <UsageBar
              label={org.seatLimitOverride ? "Seats (override)" : "Seats"}
              used={org.memberships.length}
              limit={org.seatLimitOverride ?? limits.seats}
            />
            <UsageBar label="Contacts" used={contacts} limit={limits.contacts} />
            <UsageBar label="Messages this month" used={messagesThisMonth} limit={limits.messagesPerMonth} />
            <UsageBar label="Published flows" used={publishedFlows} limit={limits.publishedFlows} />
          </div>
        </SectionCard>

        {/* Plan */}
        <SectionCard title="Plan">
          <form action={setOrgPlanAction} className="space-y-3">
            <input type="hidden" name="orgId" value={org.id} />
            <select
              name="plan"
              defaultValue={org.plan}
              className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_PRICING[p].label} — ${PLAN_PRICING[p].priceUsd}/mo
                </option>
              ))}
            </select>
            <button className="w-full rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              Update plan
            </button>
          </form>
        </SectionCard>
      </div>

      {/* Members */}
      <SectionCard title={`Members (${org.memberships.length})`} bodyClassName="px-2 pb-2">
        {org.memberships.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand-ink">
              {(m.user.name ?? m.user.email).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">
                {m.user.name ?? m.user.email}
              </div>
              <div className="truncate text-xs text-faint">{m.user.email}</div>
            </div>
            <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-sub">
              {m.role.toLowerCase()}
            </span>
          </div>
        ))}
      </SectionCard>

      {/* Edit + internal notes */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Edit organization">
          <EditOrgForm
            orgId={org.id}
            name={org.name}
            slug={org.slug}
            seatOverride={org.seatLimitOverride}
            planSeats={limits.seats}
          />
        </SectionCard>

        <SectionCard title="Internal notes">
          <p className="mb-3 -mt-1 text-sm text-sub">
            Private to platform admins — never shown to the workspace.
          </p>
          <form action={setOrgNotesAction} className="space-y-3">
            <input type="hidden" name="orgId" value={org.id} />
            <textarea
              name="notes"
              defaultValue={org.adminNotes ?? ""}
              rows={5}
              placeholder="e.g. VIP customer, billing handled manually, contact: jane@…"
              className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              Save notes
            </button>
          </form>
        </SectionCard>
      </div>

      {/* Recent admin activity */}
      <SectionCard
        title="Recent admin activity"
        action={{ label: "Full log", href: "/admin/audit" }}
        bodyClassName="px-2 pb-2"
      >
        {auditEntries.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-faint">
            No admin actions on this org yet.
          </div>
        ) : (
          auditEntries.map((e) => {
            const meta = actionMeta(e.action);
            const summary = summarizeMetadata(e.action, e.metadata);
            return (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-sub">
                  {summary && <span className="text-ink">{summary} · </span>}
                  by {e.actorEmail}
                </span>
                <span className="shrink-0 text-xs text-faint" title={e.createdAt.toISOString()}>
                  {timeAgo(e.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </SectionCard>

      {/* Operations */}
      <SectionCard title="Operations">
        <div className="flex flex-wrap gap-3">
          <form action={impersonateOrgAction}>
            <input type="hidden" name="orgId" value={org.id} />
            <button className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">
              <LogIn className="h-4 w-4" /> Impersonate
            </button>
          </form>

          {suspended ? (
            <form action={unsuspendOrgAction}>
              <input type="hidden" name="orgId" value={org.id} />
              <ConfirmSubmit
                message={`Lift the suspension on “${org.name}”? Members will regain access.`}
                className="inline-flex items-center gap-1.5 rounded-btn bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-brand/15"
              >
                <Play className="h-4 w-4" /> Unsuspend
              </ConfirmSubmit>
            </form>
          ) : (
            <form action={suspendOrgAction}>
              <input type="hidden" name="orgId" value={org.id} />
              <ConfirmSubmit
                message={`Suspend “${org.name}”? Its members will be locked out of the app until you unsuspend.`}
                className="inline-flex items-center gap-1.5 rounded-btn bg-warm/15 px-3 py-2 text-sm font-semibold text-[#c47a2e] hover:bg-warm/25"
              >
                <Ban className="h-4 w-4" /> Suspend
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </SectionCard>

      {/* Danger zone */}
      <div className="rounded-card border border-rose/30 bg-rose/[0.03] p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose" />
          <h3 className="text-base font-bold text-rose">Danger zone</h3>
        </div>
        <p className="mt-1 text-sm text-sub">
          Permanently delete this organization and <strong>all</strong> of its data —
          members, contacts, conversations, flows, broadcasts. This cannot be undone.
        </p>
        <form action={deleteOrgAction} className="mt-3">
          <input type="hidden" name="orgId" value={org.id} />
          <ConfirmSubmit
            message={`Type the organization name to permanently delete it: ${org.name}`}
            confirmText={org.name}
            className="inline-flex items-center gap-1.5 rounded-btn bg-rose px-3 py-2 text-sm font-semibold text-white hover:bg-rose/90"
          >
            <Trash2 className="h-4 w-4" /> Delete organization
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}
