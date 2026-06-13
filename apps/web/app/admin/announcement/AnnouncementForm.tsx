"use client";

import { useActionState } from "react";
import { setAnnouncementAction, type AnnouncementState } from "@/lib/actions/admin";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function AnnouncementForm({
  message,
  level,
  active,
}: {
  message: string;
  level: string;
  active: boolean;
}) {
  const [state, action] = useActionState<AnnouncementState, FormData>(
    setAnnouncementAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Message</label>
        <textarea
          name="message"
          defaultValue={message}
          rows={3}
          maxLength={500}
          placeholder="e.g. Scheduled maintenance on Sunday 2–4am UTC — sends may be delayed."
          className={field}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Style</label>
          <select name="level" defaultValue={level} className={field}>
            <option value="info">Info (blue)</option>
            <option value="warning">Warning (amber)</option>
          </select>
        </div>
        <label className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="active" defaultChecked={active} className="h-4 w-4 rounded border-line" />
          Show banner to all workspaces
        </label>
      </div>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}

      <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Save
      </button>
    </form>
  );
}
