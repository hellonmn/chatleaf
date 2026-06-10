"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Send, Loader2 } from "lucide-react";
import {
  sendBroadcastAction,
  scheduleBroadcastAction,
  cancelScheduleAction,
  type ActionState,
} from "@/lib/actions/broadcasts";

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function SendControls({
  broadcastId,
  status,
  scheduleAt,
}: {
  broadcastId: string;
  status: string;
  scheduleAt: string | null;
}) {
  const [sendState, sendAction, sending] = useActionState<ActionState, FormData>(sendBroadcastAction, undefined);
  const [schedState, schedAction, scheduling] = useActionState<ActionState, FormData>(scheduleBroadcastAction, undefined);
  const [showSchedule, setShowSchedule] = useState(false);
  const [local, setLocal] = useState("");
  const iso = local ? new Date(local).toISOString() : ""; // browser-local → UTC

  return (
    <div className="space-y-3">
      {status === "SCHEDULED" && scheduleAt && (
        <div className="flex items-center justify-between gap-3 rounded-btn bg-brand-soft/50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-semibold text-brand-ink">
            <CalendarClock className="h-4 w-4" /> Scheduled for {fmt(scheduleAt)}
          </span>
          <form action={cancelScheduleAction}>
            <input type="hidden" name="broadcastId" value={broadcastId} />
            <button className="text-xs font-semibold text-rose hover:underline">Cancel</button>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={sendAction}>
          <input type="hidden" name="broadcastId" value={broadcastId} />
          <button disabled={sending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
          </button>
        </form>
        {!showSchedule && (
          <button type="button" onClick={() => setShowSchedule(true)} className="inline-flex items-center gap-1.5 rounded-btn border border-line px-4 py-2 text-sm font-semibold text-sub hover:bg-canvas">
            <CalendarClock className="h-4 w-4" /> {status === "SCHEDULED" ? "Reschedule" : "Schedule for later"}
          </button>
        )}
      </div>

      {showSchedule && (
        <form action={schedAction} className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-canvas/50 p-3">
          <input type="hidden" name="broadcastId" value={broadcastId} />
          <input type="hidden" name="scheduleAt" value={iso} />
          <div>
            <label className="block text-xs font-semibold text-ink">Send at</label>
            <input
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="mt-1 rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button disabled={scheduling || !iso} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Schedule
          </button>
          <button type="button" onClick={() => setShowSchedule(false)} className="rounded-btn px-3 py-2 text-sm text-sub hover:bg-canvas">Close</button>
        </form>
      )}

      {(sendState?.error || schedState?.error) && (
        <p className="text-sm text-red-600">{sendState?.error ?? schedState?.error}</p>
      )}
      {(sendState?.ok || schedState?.ok) && (
        <p className="text-sm text-emerald-600">{sendState?.ok ?? schedState?.ok}</p>
      )}
      <p className="text-[11px] text-faint">Scheduled sends fire via the broadcasts cron (configure <code>CRON_SECRET</code> + a scheduler on your host).</p>
    </div>
  );
}
