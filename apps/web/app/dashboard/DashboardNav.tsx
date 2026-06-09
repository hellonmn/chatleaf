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
  BarChart3,
  MessageCircle,
  UsersRound,
  CreditCard,
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
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/team", label: "Team", icon: UsersRound },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-brand/10 font-medium text-brand-ink"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon
              className={`h-[18px] w-[18px] ${active ? "text-brand" : "text-slate-400"}`}
              strokeWidth={2}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
