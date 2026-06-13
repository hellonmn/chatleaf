import Link from "next/link";
import { ShieldCheck, ArrowLeft, LogOut } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform";
import { signOutAction } from "@/lib/actions/signout";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight text-ink">Chatleaf</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Platform admin
            </div>
          </div>
        </div>
        <AdminNav />
        <div className="space-y-1 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-sm font-medium text-sub hover:bg-canvas"
          >
            <ArrowLeft className="h-[18px] w-[18px] text-faint" /> Back to app
          </Link>
          <form action={signOutAction}>
            <button className="flex w-full items-center gap-2.5 rounded-btn px-3 py-2.5 text-sm font-medium text-rose hover:bg-rose/5">
              <LogOut className="h-[18px] w-[18px]" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-white/80 px-6 py-3.5 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-ink">
              Platform admin
            </h1>
            <p className="truncate text-sm text-sub">
              Manage every workspace on Chatleaf
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-card border border-line bg-white px-3 py-1.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">
              {(admin.name ?? admin.email).slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-sm font-semibold text-ink sm:block">
              {admin.name ?? admin.email}
            </span>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
