"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, ScrollText, MessageCircle, DollarSign, Megaphone, Settings, CreditCard, Ticket, Sparkles, Activity, Wallet, type LucideIcon } from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/orgs", label: "Organizations", icon: Building2 },
  { href: "/admin/plans", label: "Plans", icon: CreditCard },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/revenue", label: "Revenue", icon: DollarSign },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet },
  { href: "/admin/health", label: "WhatsApp health", icon: MessageCircle },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/announcement", label: "Announcement", icon: Megaphone },
  { href: "/admin/spotlight", label: "What's new", icon: Sparkles },
  { href: "/admin/logs", label: "Request logs", icon: Activity },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
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
          </Link>
        );
      })}
    </nav>
  );
}
