"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Clock, MoonStar, Check, Loader2 } from "lucide-react";
import { saveBusinessHoursAction, type SettingsState } from "@/lib/actions/settings";

type Day = { enabled: boolean; open: string; close: string };
type Hours = Record<string, Day>;

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
] as const;

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Karachi", "Asia/Dhaka", "Asia/Singapore",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles",
  "America/Sao_Paulo", "Australia/Sydney", "UTC",
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes
    </button>
  );
}

export function HoursForm({
  timezone: tz0,
  awayEnabled: away0,
  awayMessage: msg0,
  hours: hours0,
}: {
  timezone: string;
  awayEnabled: boolean;
  awayMessage: string;
  hours: Hours;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveBusinessHoursAction, undefined);
  const [timezone, setTimezone] = useState(tz0);
  const [awayEnabled, setAwayEnabled] = useState(away0);
  const [awayMessage, setAwayMessage] = useState(msg0);
  const [hours, setHours] = useState<Hours>(hours0);

  const setDay = (k: string, patch: Partial<Day>) =>
    setHours((h) => ({ ...h, [k]: { ...h[k]!, ...patch } }));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="hours" value={JSON.stringify(hours)} />
      <input type="hidden" name="awayEnabled" value={awayEnabled ? "true" : "false"} />

      {/* Timezone */}
      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        <label className="flex items-center gap-2 text-sm font-bold text-ink"><Clock className="h-4 w-4 text-brand" /> Timezone</label>
        <p className="mt-0.5 text-xs text-sub">Business hours are evaluated in this timezone.</p>
        <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-2 w-full max-w-xs rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand">
          {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Hours grid */}
      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-bold text-ink">Operating hours</h2>
        <div className="mt-3 space-y-2">
          {DAYS.map(([k, label]) => {
            const d = hours[k]!;
            return (
              <div key={k} className="flex items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.enabled} onChange={(e) => setDay(k, { enabled: e.target.checked })} className="h-4 w-4 accent-brand" />
                  <span className={d.enabled ? "font-medium text-ink" : "text-faint"}>{label}</span>
                </label>
                {d.enabled ? (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="time" value={d.open} onChange={(e) => setDay(k, { open: e.target.value })} className="rounded-btn border border-line bg-white px-2 py-1.5 outline-none focus:border-brand" />
                    <span className="text-faint">to</span>
                    <input type="time" value={d.close} onChange={(e) => setDay(k, { close: e.target.value })} className="rounded-btn border border-line bg-white px-2 py-1.5 outline-none focus:border-brand" />
                  </div>
                ) : (
                  <span className="text-sm text-faint">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Away message */}
      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={awayEnabled} onChange={(e) => setAwayEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><MoonStar className="h-4 w-4 text-violet" /> Away auto-reply</span>
            <span className="block text-xs text-sub">Auto-respond to new messages received outside business hours (max once every 6 hours per contact, and never when an agent has taken over).</span>
          </span>
        </label>
        {awayEnabled && (
          <textarea name="awayMessage" value={awayMessage} onChange={(e) => setAwayMessage(e.target.value)} rows={3} maxLength={1024} className="mt-3 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {state?.error && <span className="text-sm text-rose">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-600">{state.ok}</span>}
        <SaveButton />
      </div>
    </form>
  );
}
