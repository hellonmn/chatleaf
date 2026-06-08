import Link from "next/link";
import { requireActiveContext } from "@/lib/session";
import { signOutAction } from "@/lib/actions/signout";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▣" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "✉" },
  { href: "/dashboard/contacts", label: "Contacts", icon: "◷" },
  { href: "/dashboard/flows", label: "Flows", icon: "⇄" },
  { href: "/dashboard/broadcasts", label: "Broadcasts", icon: "📣" },
  { href: "/dashboard/templates", label: "Templates", icon: "🗂" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📊" },
  { href: "/dashboard/settings/whatsapp", label: "WhatsApp", icon: "💬" },
  { href: "/dashboard/team", label: "Team", icon: "♟" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", soon: true },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveContext();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-bold text-brand-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
            W
          </span>
          Watool
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.soon ? "#" : item.href}
              aria-disabled={item.soon}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                item.soon
                  ? "cursor-not-allowed text-slate-400"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-4 text-center">{item.icon}</span>
                {item.label}
              </span>
              {item.soon && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  soon
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Phase 0 · foundations
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {ctx.orgName}
            </div>
            <div className="text-xs text-slate-500">
              {ctx.email} · {ctx.role.toLowerCase()}
            </div>
          </div>
          <form action={signOutAction}>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
