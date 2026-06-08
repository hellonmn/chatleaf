"use client";

import { useActionState } from "react";
import { setAttributeAction, type ActionState } from "@/lib/actions/contacts";

export function AttributeForm({ contactId }: { contactId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    setAttributeAction,
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <input
        name="key"
        placeholder="key (e.g. plan)"
        className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
      <input
        name="value"
        placeholder="value"
        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
      <button className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
        Save
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-xs text-emerald-600">{state.ok}</span>}
    </form>
  );
}
