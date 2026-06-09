"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { timeAgo } from "@/lib/format";

export type ConversationItem = {
  id: string;
  name: string;
  waId: string;
  status: string;
  lastMessageAt: string;
  snippet: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "BOT", label: "Bot" },
  { key: "AGENT", label: "Agent" },
  { key: "CLOSED", label: "Closed" },
] as const;

const STATUS_DOT: Record<string, string> = {
  BOT: "bg-sky-500",
  AGENT: "bg-amber-500",
  OPEN: "bg-slate-400",
  CLOSED: "bg-slate-300",
};

export function ConversationList({ items }: { items: ConversationItem[] }) {
  const pathname = usePathname();
  const activeId = pathname.split("/")[3]; // /dashboard/inbox/<id>
  const [filter, setFilter] = useState<string>("all");

  const shown = items.filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-slate-200">
      <AutoRefresh seconds={6} />
      {/* Header + filters */}
      <div className="border-b border-slate-100 px-3 py-2.5">
        <h1 className="px-1 text-sm font-semibold text-slate-900">Inbox</h1>
        <div className="mt-2 flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                filter === f.key
                  ? "bg-brand text-white"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No conversations here yet.
          </div>
        ) : (
          shown.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className={`flex items-center gap-3 border-b border-slate-50 px-3 py-3 transition-colors ${
                  active ? "bg-brand/10" : "hover:bg-slate-50"
                }`}
              >
                <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand-ink">
                  {c.name.slice(0, 2).toUpperCase()}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                      STATUS_DOT[c.status] ?? "bg-slate-300"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{c.snippet}</div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
