"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tag as TagIcon, Trash2, X, Loader2 } from "lucide-react";
import { bulkContactsAction, type ActionState } from "@/lib/actions/contacts";
import { timeAgo } from "@/lib/format";

export type Row = {
  id: string;
  name: string;
  phone: string | null;
  waId: string;
  stage: string;
  tags: string[];
  source: string | null;
  ownerName: string | null;
  value: number | null;
  lastInboundAt: string | null;
};

const STAGES = ["NEW", "QUALIFIED", "ENGAGED", "CONVERTED"] as const;
const STAGE_META: Record<string, { label: string; dot: string; pill: string }> = {
  NEW: { label: "New", dot: "#97a1b0", pill: "bg-canvas text-sub" },
  QUALIFIED: { label: "Qualified", dot: "#56a8d8", pill: "bg-[#e6f1fb] text-[#3179a8]" },
  ENGAGED: { label: "Engaged", dot: "#f3a05a", pill: "bg-warm/15 text-[#c47a2e]" },
  CONVERTED: { label: "Converted", dot: "#0e7490", pill: "bg-brand-soft text-brand-ink" },
};
const money = (v: number | null) => (v == null ? "—" : "₹" + v.toLocaleString("en-IN"));

export function ContactsTable({ rows, tags }: { rows: Row[]; tags: string[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(bulkContactsAction, undefined);

  useEffect(() => {
    if (state?.ok) { setSel(new Set()); setTag(""); router.refresh(); }
  }, [state, router]);

  const allChecked = rows.length > 0 && sel.size === rows.length;
  const ids = useMemo(() => [...sel].join(","), [sel]);

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  function submit(op: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("ids", ids);
    fd.set("op", op);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    action(fd);
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
              <th className="w-9 px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-brand" />
              </th>
              <th className="px-2 py-2.5 font-semibold">Contact</th>
              <th className="px-3 py-2.5 font-semibold">Stage</th>
              <th className="px-3 py-2.5 font-semibold">Tags</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">Owner</th>
              <th className="px-3 py-2.5 text-right font-semibold">Est. value</th>
              <th className="px-5 py-2.5 text-right font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const m = STAGE_META[c.stage] ?? STAGE_META.NEW!;
              const checked = sel.has(c.id);
              return (
                <tr key={c.id} className={`border-b border-line/70 last:border-0 ${checked ? "bg-brand/[0.05]" : "hover:bg-canvas/60"}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="h-4 w-4 accent-brand" />
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/dashboard/contacts/${c.id}`} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand-ink">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-faint">{c.phone ?? "+" + c.waId}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs font-semibold ${m.pill}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
                      {m.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length === 0 && <span className="text-faint">—</span>}
                      {c.tags.map((t) => (
                        <span key={t} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-sub">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sub">{c.source ?? "—"}</td>
                  <td className="px-3 py-3">
                    {c.ownerName ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-violet/15 text-[11px] font-bold text-violet" title={c.ownerName}>
                        {c.ownerName.slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">{money(c.value)}</td>
                  <td className="px-5 py-3 text-right text-faint">{c.lastInboundAt ? timeAgo(c.lastInboundAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {sel.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-card border border-line bg-white px-3 py-2 shadow-card-lg">
          <span className="px-1 text-sm font-bold text-ink">{sel.size} selected</span>
          <span className="h-5 w-px bg-line" />

          <div className="flex items-center gap-1">
            <input
              list="bulk-tags"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="tag…"
              className="w-24 rounded-btn border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <datalist id="bulk-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
            <button type="button" disabled={pending || !tag.trim()} onClick={() => submit("addTag", { tag })} className="inline-flex items-center gap-1 rounded-btn bg-canvas px-2.5 py-1.5 text-sm font-semibold text-sub hover:bg-line disabled:opacity-50">
              <TagIcon className="h-3.5 w-3.5" /> Tag
            </button>
          </div>

          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => { if (e.target.value) { submit("setStage", { stage: e.target.value }); e.target.value = ""; } }}
            className="rounded-btn border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="" disabled>Set stage…</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s]!.label}</option>)}
          </select>

          <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete ${sel.size} contact(s)? This can't be undone.`)) submit("delete"); }} className="inline-flex items-center gap-1 rounded-btn bg-rose/10 px-2.5 py-1.5 text-sm font-semibold text-rose hover:bg-rose/15 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>

          {pending && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
          {state?.error && <span className="text-xs text-rose">{state.error}</span>}
          <button type="button" onClick={() => setSel(new Set())} className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-canvas"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
