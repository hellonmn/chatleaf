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

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center px-5 py-4">
          <Wordmark size={24} />
        </div>
        <DashboardNav />
        <div className="border-t border-line px-5 py-3">
          <div className="truncate text-sm font-semibold text-ink">{ctx.orgName}</div>
          <div className="text-xs text-faint">{ctx.plan} plan</div>
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
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
