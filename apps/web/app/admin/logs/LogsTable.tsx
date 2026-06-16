"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2, Radio } from "lucide-react";
import type { RequestLogEntry } from "@/lib/request-log";

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-slate-100 text-slate-600",
  POST: "bg-emerald-50 text-emerald-700",
  PUT: "bg-sky/15 text-sky",
  PATCH: "bg-warm/15 text-[#c47a2e]",
  DELETE: "bg-rose/10 text-rose",
};

export function LogsTable() {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const lastId = useRef(0);

  useEffect(() => {
    if (paused) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await fetch(`/api/request-log?since=${lastId.current}`, { cache: "no-store" });
        if (r.ok) {
          const { logs: fresh } = (await r.json()) as { logs: RequestLogEntry[] };
          if (fresh.length) {
            lastId.current = fresh[fresh.length - 1]!.id;
            setLogs((prev) => [...fresh.slice().reverse(), ...prev].slice(0, 500));
          }
        }
      } catch {
        /* keep polling */
      }
      if (!stop) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [paused]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sub">
          <Radio className={`h-4 w-4 ${paused ? "text-faint" : "animate-pulse text-emerald-600"}`} />
          {paused ? "Paused" : "Live"} · {logs.length} shown
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => setLogs([])}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
          >
            <Trash2 className="h-4 w-4" /> Clear
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white">
        <div className="grid grid-cols-[64px_1fr_auto_auto] gap-3 border-b border-line px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-faint">
          <span>Method</span>
          <span>Path</span>
          <span className="text-right">IP</span>
          <span className="text-right">Time</span>
        </div>
        {logs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-faint">
            Waiting for requests… browse the app in another tab to see them appear.
          </div>
        ) : (
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto font-mono text-xs">
            {logs.map((l) => (
              <div key={l.id} className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-3 px-4 py-1.5">
                <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${METHOD_STYLE[l.method] ?? "bg-canvas text-sub"}`}>
                  {l.method}
                </span>
                <span className="truncate text-ink" title={l.ua}>{l.path}</span>
                <span className="text-right text-faint">{l.ip ?? "—"}</span>
                <span className="text-right text-faint">{new Date(l.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
