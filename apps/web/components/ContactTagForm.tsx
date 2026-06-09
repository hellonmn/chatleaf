"use client";

import { useActionState } from "react";
import { addTagAction, type ActionState } from "@/lib/actions/contacts";

export function ContactTagForm({ contactId }: { contactId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    addTagAction,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <input
        name="name"
        placeholder="Add tag…"
        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
      <button className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
        Add
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
