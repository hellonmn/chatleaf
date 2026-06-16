import Link from "next/link";
import { Eye, Info, AlertTriangle } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getPlanLimits } from "@/lib/plan-config";
import { getActiveSpotlightForUser } from "@/lib/spotlight";
import { stopImpersonatingAction } from "@/lib/actions/admin";
import { BrandMark } from "@/components/BrandMark";
import { SpotlightModal } from "@/components/SpotlightModal";
import { DashboardNav } from "./DashboardNav";
import { Topbar } from "./Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveContext();
  const [members, openChats, announcement, settings, limits, spotlight] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.conversation.count({ where: { orgId: ctx.orgId, status: { in: ["BOT", "AGENT", "OPEN"] } } }),
    prisma.platformAnnouncement.findUnique({ where: { id: "global" } }),
    getPlatformSettings(),
    getPlanLimits(ctx.plan),
    getActiveSpotlightForUser(ctx.userId),
  ]);
  const banner = announcement?.active && announcement.message ? announcement : null;
  const bannerWarning = banner?.level === "warning";
  const seats = ctx.seatLimitOverride ?? limits.seats;
  const pct = Math.min(100, Math.round((members / seats) * 100));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center px-5 py-4">
          <BrandMark brandName={settings.brandName} logoUrl={settings.logoUrl} size={24} />
        </div>
        <DashboardNav
          inboxCount={openChats}
          features={{
            broadcasts: settings.broadcastsEnabled,
            flows: settings.flowsEnabled,
            templates: settings.templatesEnabled,
          }}
        />
        <div className="p-3">
          <div className="rounded-card bg-brand-soft p-3 text-center">
            <div className="text-sm font-bold text-brand-ink">
              {members} of {seats} seats
            </div>
            <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
            <Link
              href="/dashboard/settings/billing"
              className="mt-2 block text-xs font-medium text-brand-dark hover:underline"
            >
              Upgrade for more seats
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.impersonating && (
          <div className="flex items-center justify-between gap-3 bg-ink px-6 py-2 text-sm text-white">
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Viewing <strong className="font-semibold">{ctx.orgName}</strong> as a platform admin
            </span>
            <form action={stopImpersonatingAction}>
              <button className="rounded-pill bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">
                Exit impersonation
              </button>
            </form>
          </div>
        )}
        <Topbar
          name={ctx.name}
          email={ctx.email}
          role={ctx.role}
          plan={ctx.plan}
          orgName={ctx.orgName}
          inboxCount={openChats}
          isPlatformAdmin={ctx.isPlatformAdmin}
        />
        {banner && (
          <div
            className={`flex items-center gap-2 px-6 py-2.5 text-sm ${
              bannerWarning ? "bg-warm/15 text-[#9a5a1e]" : "bg-brand-soft text-brand-ink"
            }`}
          >
            {bannerWarning ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Info className="h-4 w-4 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
      {spotlight && <SpotlightModal slides={spotlight.slides} />}
    </div>
  );
}
