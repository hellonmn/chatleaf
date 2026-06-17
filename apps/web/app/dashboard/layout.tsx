import Link from "next/link";
import { Eye, Info, AlertTriangle, Wallet } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getPlanLimits } from "@/lib/plan-config";
import { getActiveSpotlightForUser } from "@/lib/spotlight";
import { getActiveChannelId } from "@/lib/active-channel";
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
  const [members, openChats, announcement, settings, limits, spotlight, phones, activeChannelId, wallet] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.conversation.count({ where: { orgId: ctx.orgId, status: { in: ["BOT", "AGENT", "OPEN"] } } }),
    prisma.platformAnnouncement.findUnique({ where: { id: "global" } }),
    getPlatformSettings(),
    getPlanLimits(ctx.plan),
    getActiveSpotlightForUser(ctx.userId),
    prisma.phoneNumber.findMany({
      where: { account: { orgId: ctx.orgId } },
      select: { id: true, displayNumber: true },
      orderBy: { createdAt: "asc" },
    }),
    getActiveChannelId(),
    prisma.wallet.findUnique({ where: { orgId: ctx.orgId }, select: { balancePaise: true, lowBalanceThresholdPaise: true } }),
  ]);
  const channels = phones.map((p) => ({ id: p.id, label: p.displayNumber }));
  const banner = announcement?.active && announcement.message ? announcement : null;
  const bannerWarning = banner?.level === "warning";
  // Low-balance nudge only when wallet billing is actually switched on platform-wide.
  const lowWallet = settings.walletBillingEnabled && !!wallet && wallet.balancePaise <= wallet.lowBalanceThresholdPaise;
  const walletBalanceInr = wallet ? (wallet.balancePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
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
          channels={channels}
          activeChannelId={activeChannelId}
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
        {lowWallet && (
          <Link
            href="/dashboard/settings/wallet"
            className="flex items-center gap-2 bg-rose/10 px-6 py-2.5 text-sm font-medium text-rose hover:bg-rose/15"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span>Low wallet balance (₹{walletBalanceInr}) — top up to keep messages sending.</span>
            <span className="ml-auto font-semibold underline">Add funds</span>
          </Link>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
      {spotlight && <SpotlightModal slides={spotlight.slides} />}
    </div>
  );
}
