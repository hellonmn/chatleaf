"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Upload, X, Loader2, FileSpreadsheet } from "lucide-react";
import { importContactsAction, type ActionState } from "@/lib/actions/contacts";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
    </button>
  );
}

export function ImportContacts() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action] = useActionState<ActionState, FormData>(importContactsAction, undefined);

  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
      >
        <Upload className="h-4 w-4" /> Import
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-card border border-line bg-white p-5 shadow-card-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"><FileSpreadsheet className="h-4 w-4" /></span>
                <h2 className="text-sm font-bold text-ink">Import contacts</h2>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-faint hover:bg-canvas"><X className="h-4 w-4" /></button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-sub">
              Upload a <strong>CSV</strong> with a <code className="rounded bg-canvas px-1">phone</code> (or <code className="rounded bg-canvas px-1">waId</code>) column.
              Optional columns: <em>name, stage, source, value, tags, notes</em>. Existing contacts are matched by number and updated.
            </p>

            <form action={action} className="mt-3 space-y-3">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="block w-full rounded-btn border border-line bg-canvas px-3 py-2 text-sm text-sub file:mr-3 file:rounded-btn file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
              />
              {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
              {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-btn border border-line px-3 py-2 text-sm font-semibold text-sub hover:bg-canvas">Close</button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
