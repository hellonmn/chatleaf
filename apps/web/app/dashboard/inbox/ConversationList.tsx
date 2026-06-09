"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Check } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { timeAgo } from "@/lib/format";

export type ConversationItem = {
  id: string;
  name: string;
  waId: string;
  status: string;
  lastMessageAt: string;
  snippet: string;
  unread: number;
  resolved: boolean;
  assignedToMe: boolean;
  color: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mine", label: "Assigned to me" },
  { key: "resolved", label: "Resolved" },
] as const;

function ini(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export function ConversationList({ items }: { items: ConversationItem[] }) {
  const pathname = usePathname();
  const activeId = pathname.split("/")[3];
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const shown = items.filter((c) => {
    if (filter === "unread" && c.unread === 0) return false;
    if (filter === "mine" && !c.assignedToMe) return false;
    if (filter === "resolved" && !c.resolved) return false;
    if (q && !c.name.toLowerCase().includes(q) && !c.waId.includes(q)) return false;
    return true;
  });

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-r border-line">
      <AutoRefresh seconds={6} />
      <div className="space-y-2.5 border-b border-line px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-btn bg-canvas py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === f.key ? "bg-brand text-white" : "bg-canvas text-sub hover:bg-line"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="p-6 text-center text-xs text-faint">No conversations here.</div>
        ) : (
          shown.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className={`flex items-center gap-3 border-l-[3px] px-4 py-3 transition-colors ${
                  active
                    ? "border-brand bg-brand/[0.07]"
                    : "border-transparent hover:bg-canvas"
                }`}
              >
                <span className="relative shrink-0">
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: c.color }}
                  >
                    {ini(c.name)}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#25D366]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm font-bold text-ink">
                      <span className="truncate">{c.name}</span>
                      {c.resolved && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${c.unread > 0 ? "font-semibold text-ink" : "text-sub"}`}>
                      {c.snippet}
                    </span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
