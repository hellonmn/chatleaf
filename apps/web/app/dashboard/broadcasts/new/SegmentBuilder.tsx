"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Users, Tag as TagIcon, Loader2 } from "lucide-react";
import { estimateAudienceAction } from "@/lib/actions/broadcasts";

const STAGES = [
  { key: "NEW", label: "New" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "ENGAGED", label: "Engaged" },
  { key: "CONVERTED", label: "Converted" },
] as const;

const ACTIVE = [
  { v: 0, label: "Any time" },
  { v: 7, label: "Last 7 days" },
  { v: 30, label: "Last 30 days" },
  { v: 90, label: "Last 90 days" },
] as const;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3 py-1 text-xs font-semibold transition ${
        on ? "bg-brand text-white" : "bg-canvas text-sub hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

export function SegmentBuilder({ tags, initialCount }: { tags: string[]; initialCount: number }) {
  const [optedInOnly, setOptedInOnly] = useState(true);
  const [selTags, setSelTags] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [lastActiveDays, setLastActiveDays] = useState(0);

  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const filter = useMemo(
    () => ({
      optedInOnly,
      ...(selTags.length ? { tags: selTags } : {}),
      ...(stages.length ? { stages } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
      ...(lastActiveDays ? { lastActiveDays } : {}),
    }),
    [optedInOnly, selTags, stages, source, lastActiveDays],
  );

  // Debounced live audience count.
  const key = JSON.stringify(filter);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        setCount(await estimateAudienceAction(JSON.parse(key)));
      });
    }, 300);
    return () => clearTimeout(timer.current);
  }, [key]);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="filter" value={key} />

      {/* Reach */}
      <div className="flex items-center gap-3 rounded-card border border-brand/20 bg-brand-soft/40 px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-brand shadow-sm"><Users className="h-5 w-5" /></span>
        <div>
          <div className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight text-ink">
            {pending ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : count.toLocaleString()}
            <span className="text-sm font-semibold text-sub">contacts</span>
          </div>
          <div className="text-xs text-sub">will receive this broadcast</div>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div>
          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink"><TagIcon className="h-3.5 w-3.5" /> Tags (any of)</label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Chip key={t} on={selTags.includes(t)} onClick={() => setSelTags((a) => toggle(a, t))}>{t}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* Stages */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Lifecycle stage</label>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <Chip key={s.key} on={stages.includes(s.key)} onClick={() => setStages((a) => toggle(a, s.key))}>{s.label}</Chip>
          ))}
        </div>
      </div>

      {/* Source + activity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink">Source</label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="any"
            className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink">Last active</label>
          <select
            value={lastActiveDays}
            onChange={(e) => setLastActiveDays(Number(e.target.value))}
            className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            {ACTIVE.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </div>
      </div>

      {/* Opt-in */}
      <label className="flex items-start gap-2.5 rounded-card border border-line bg-canvas/60 p-2.5">
        <input type="checkbox" checked={optedInOnly} onChange={(e) => setOptedInOnly(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
        <span>
          <span className="block text-xs font-bold text-ink">Opted-in contacts only</span>
          <span className="block text-[11px] text-faint">Recommended — Meta penalizes messaging contacts who haven't opted in.</span>
        </span>
      </label>
    </div>
  );
}
