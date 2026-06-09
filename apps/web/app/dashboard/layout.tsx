import { LogOut } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { signOutAction } from "@/lib/actions/signout";
import { Wordmark } from "@/components/Wordmark";
import { DashboardNav } from "./DashboardNav";

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
        <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400">
          {ctx.plan} plan
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {ctx.orgName}
            </div>
            <div className="truncate text-xs text-slate-500">
              {ctx.email} · {ctx.role.toLowerCase()}
            </div>
          </div>
          <form action={signOutAction}>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
