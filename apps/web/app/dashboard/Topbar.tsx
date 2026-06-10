"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Settings, CreditCard, BarChart3, Bell, MessageSquareText } from "lucide-react";
import { signOutAction } from "@/lib/actions/signout";

/** Per-route page title + subtitle, mirroring the Chatleaf Portal mockup's META map. */
const META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard/inbox": { title: "Inbox", subtitle: "Your conversations in one place" },
  "/dashboard/contacts": { title: "Contacts", subtitle: "Your leads and customers" },
  "/dashboard/flows": { title: "Automations", subtitle: "No-code chatbot flows that work 24/7" },
  "/dashboard/broadcasts": { title: "Broadcasts", subtitle: "Reach your audience with personalized campaigns" },
  "/dashboard/templates": { title: "Message templates", subtitle: "Reusable, pre-approved WhatsApp messages" },
  "/dashboard/analytics": { title: "Analytics", subtitle: "How your conversations are performing" },
  "/dashboard/settings/whatsapp": { title: "Channels", subtitle: "Connect and manage your messaging channels" },
  "/dashboard/team": { title: "Team", subtitle: "Who has access to this workspace" },
  "/dashboard/settings/billing": { title: "Billing & usage", subtitle: "Your plan, limits, and usage" },
};

function greeting(name: string | null): { title: string; subtitle: string } {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return {
    title: `${part}${first ? `, ${first}` : ""} 👋`,
    subtitle: "Here's what's happening across your conversations.",
  };
}

function initials(name: string | null, email: string): string {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Topbar({
  name,
  email,
  role,
  plan,
  orgName,
  inboxCount = 0,
}: {
  name: string | null;
  email: string;
  role: string;
  plan: string;
  orgName: string;
  inboxCount?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  // Pick the title: exact match, else longest matching prefix, else dashboard greeting.
  let meta = pathname === "/dashboard" ? greeting(name) : META[pathname];
  if (!meta) {
    const key = Object.keys(META)
      .filter((k) => pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    meta = key ? META[key]! : greeting(name);
  }
  if (pathname.startsWith("/dashboard/inbox")) {
    meta = {
      title: "Inbox",
      subtitle:
        inboxCount > 0
          ? `${inboxCount} open conversation${inboxCount === 1 ? "" : "s"} need${inboxCount === 1 ? "s" : ""} a reply`
          : "You're all caught up",
    };
  }

  const orgInitials = initials(null, orgName);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-line bg-white/80 px-6 py-3.5 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-extrabold tracking-tight text-ink">
          {meta.title}
        </h1>
        <p className="truncate text-sm text-sub">{meta.subtitle}</p>
      </div>

      {/* Workspace + bell + profile */}
      <div className="flex shrink-0 items-center gap-2">
      <div className="hidden items-center gap-2 rounded-card border border-line bg-white px-2.5 py-1.5 sm:flex">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-[11px] font-bold text-white">
          {orgInitials}
        </span>
        <span className="max-w-[130px] truncate text-sm font-semibold text-ink">{orgName}</span>
        <ChevronDown className="h-4 w-4 text-faint" />
      </div>
      <button
        type="button"
        title="Notifications"
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-sub transition-colors hover:bg-canvas"
      >
        <Bell className="h-4 w-4" />
      </button>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-btn px-1.5 py-1.5 transition-colors hover:bg-canvas"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">
            {initials(name, email)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[140px] truncate text-sm font-semibold text-ink">
              {name ?? email}
            </span>
            <span className="block text-xs text-faint">{role.toLowerCase()}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-faint" />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-card border border-line bg-white shadow-card-lg">
            <div className="border-b border-line px-4 py-3">
              <div className="truncate text-sm font-semibold text-ink">{name ?? "Account"}</div>
              <div className="truncate text-xs text-sub">{email}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
                  {plan} plan
                </span>
                <span className="truncate text-[11px] text-faint">{orgName}</span>
              </div>
            </div>
            <div className="py-1">
              <Link
                href="/dashboard/analytics"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas"
              >
                <BarChart3 className="h-4 w-4" /> Analytics
              </Link>
              <Link
                href="/dashboard/team"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas"
              >
                <Settings className="h-4 w-4" /> Workspace &amp; team
              </Link>
              <Link
                href="/dashboard/settings/replies"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas"
              >
                <MessageSquareText className="h-4 w-4" /> Saved replies
              </Link>
              <Link
                href="/dashboard/settings/billing"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas"
              >
                <CreditCard className="h-4 w-4" /> Billing &amp; usage
              </Link>
            </div>
            <form action={signOutAction} className="border-t border-line">
              <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-rose hover:bg-rose/5">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
