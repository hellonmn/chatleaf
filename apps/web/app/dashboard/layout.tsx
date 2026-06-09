import Link from "next/link";
import { prisma } from "@watool/db";
import { planLimits } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { Wordmark } from "@/components/Wordmark";
import { DashboardNav } from "./DashboardNav";
import { Topbar } from "./Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveContext();
  const [members, openChats] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.conversation.count({ where: { orgId: ctx.orgId, status: { in: ["BOT", "AGENT", "OPEN"] } } }),
  ]);
  const seats = planLimits(ctx.plan).seats;
  const pct = Math.min(100, Math.round((members / seats) * 100));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center px-5 py-4">
          <Wordmark size={24} />
        </div>
        <DashboardNav inboxCount={openChats} />
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
        <Topbar
          name={ctx.name}
          email={ctx.email}
          role={ctx.role}
          plan={ctx.plan}
          orgName={ctx.orgName}
          inboxCount={openChats}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
