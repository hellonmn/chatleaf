"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Users,
  Workflow,
  Megaphone,
  LayoutTemplate,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/dashboard/flows", label: "Automations", icon: Workflow },
  { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/dashboard/settings/whatsapp", label: "Channels", icon: MessageCircle },
];

export function DashboardNav({ inboxCount = 0 }: { inboxCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        const badge = item.href === "/dashboard/inbox" && inboxCount > 0 ? inboxCount : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-brand font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)]"
                : "font-medium text-sub hover:bg-canvas"
            }`}
          >
            <Icon
              className={`h-[18px] w-[18px] ${active ? "text-white" : "text-faint"}`}
              strokeWidth={2}
            />
            <span className="flex-1">{item.label}</span>
            {badge && (
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold ${
                  active ? "bg-white/25 text-white" : "bg-warm text-white"
                }`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
