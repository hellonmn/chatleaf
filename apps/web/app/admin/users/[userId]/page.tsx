import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldOff,
  Ban,
  Play,
  Trash2,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { prisma } from "@watool/db";
import { requirePlatformAdmin, isPlatformAdminEmail } from "@/lib/platform";
import {
  setPlatformAdminAction,
  setUserDisabledAction,
  deleteUserAction,
} from "@/lib/actions/admin";
import { Card, SectionCard } from "@/components/ui/Card";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { timeAgo } from "@/lib/format";
import { actionMeta } from "@/lib/audit-format";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const me = await requirePlatformAdmin();
  const { userId } = await params;

  const [user, auditEntries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { org: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.adminAuditLog.findMany({
      where: { targetType: "user", targetId: userId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);
  if (!user) notFound();

  const envAdmin = isPlatformAdminEmail(user.email);
  const isAdmin = user.isPlatformAdmin || envAdmin;
  const isSelf = user.id === me.userId;
  const disabled = !!user.disabledAt;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-sub hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand/10 text-base font-bold text-brand-ink">
            {(user.name ?? user.email).slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-ink">
                {user.name ?? user.email}
              </h2>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">
                  <ShieldCheck className="h-3 w-3" /> platform admin
                </span>
              )}
              {disabled && (
                <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
                  deactivated
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-sub">
              {user.email} · joined {timeAgo(user.createdAt)}
            </div>
          </div>
        </div>
      </Card>

      {/* Memberships */}
      <SectionCard title={`Workspaces (${user.memberships.length})`} bodyClassName="px-2 pb-2">
        {user.memberships.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-faint">
            Not a member of any workspace.
          </div>
        ) : (
          user.memberships.map((m) => (
            <Link
              key={m.id}
              href={`/admin/orgs/${m.orgId}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-ink">
                <Building2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{m.org.name}</div>
                <div className="truncate text-xs text-faint">/{m.org.slug}</div>
              </div>
              <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-sub">
                {m.role.toLowerCase()}
              </span>
            </Link>
          ))
        )}
      </SectionCard>

      {/* Recent admin activity */}
      {auditEntries.length > 0 && (
        <SectionCard
          title="Recent admin activity"
          action={{ label: "Full log", href: "/admin/audit" }}
          bodyClassName="px-2 pb-2"
        >
          {auditEntries.map((e) => {
            const meta = actionMeta(e.action);
            return (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-sub">by {e.actorEmail}</span>
                <span className="shrink-0 text-xs text-faint" title={e.createdAt.toISOString()}>
                  {timeAgo(e.createdAt)}
                </span>
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* Account actions */}
      <SectionCard title="Account">
        <div className="flex flex-wrap items-start gap-3">
          {/* Platform admin toggle */}
          {envAdmin ? (
            <span className="inline-flex items-center rounded-btn border border-line px-3 py-2 text-sm text-faint">
              Admin via env (PLATFORM_ADMIN_EMAILS)
            </span>
          ) : isSelf ? (
            <span className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm text-faint">
              <ShieldCheck className="h-4 w-4" /> This is your account
            </span>
          ) : (
            <form action={setPlatformAdminAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="value" value={user.isPlatformAdmin ? "false" : "true"} />
              {user.isPlatformAdmin ? (
                <ConfirmSubmit
                  message={`Revoke platform-admin access for ${user.email}?`}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm font-semibold text-sub hover:bg-canvas"
                >
                  <ShieldOff className="h-4 w-4" /> Revoke admin
                </ConfirmSubmit>
              ) : (
                <button className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink/90">
                  <ShieldCheck className="h-4 w-4" /> Make admin
                </button>
              )}
            </form>
          )}

          {/* Deactivate / reactivate */}
          {!isSelf &&
            (disabled ? (
              <form action={setUserDisabledAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="value" value="false" />
                <button className="inline-flex items-center gap-1.5 rounded-btn bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-brand/15">
                  <Play className="h-4 w-4" /> Reactivate
                </button>
              </form>
            ) : (
              <form action={setUserDisabledAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="value" value="true" />
                <ConfirmSubmit
                  message={`Deactivate ${user.email}? They will be signed out and unable to log in until reactivated.`}
                  className="inline-flex items-center gap-1.5 rounded-btn bg-warm/15 px-3 py-2 text-sm font-semibold text-[#c47a2e] hover:bg-warm/25"
                >
                  <Ban className="h-4 w-4" /> Deactivate
                </ConfirmSubmit>
              </form>
            ))}
        </div>
      </SectionCard>

      {/* Password */}
      <SectionCard title="Password">
        <p className="mb-3 -mt-1 text-sm text-sub">
          Generate a new password for this user (no email delivery yet — you&apos;ll get
          a one-time value to relay).
        </p>
        <ResetPasswordButton userId={user.id} />
      </SectionCard>

      {/* Danger zone */}
      {!isSelf && (
        <div className="rounded-card border border-rose/30 bg-rose/[0.03] p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose" />
            <h3 className="text-base font-bold text-rose">Danger zone</h3>
          </div>
          <p className="mt-1 text-sm text-sub">
            Permanently delete this user and remove them from all workspaces. Orgs they
            own are <strong>not</strong> deleted (they may be left without an owner) —
            consider transferring ownership first.
          </p>
          <form action={deleteUserAction} className="mt-3">
            <input type="hidden" name="userId" value={user.id} />
            <ConfirmSubmit
              message={`Type the user's email to permanently delete them: ${user.email}`}
              confirmText={user.email}
              className="inline-flex items-center gap-1.5 rounded-btn bg-rose px-3 py-2 text-sm font-semibold text-white hover:bg-rose/90"
            >
              <Trash2 className="h-4 w-4" /> Delete user
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}
