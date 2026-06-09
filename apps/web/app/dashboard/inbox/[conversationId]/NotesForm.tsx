"use client";

import { useActionState, useState } from "react";
import { setContactNotesAction, type ActionState } from "@/lib/actions/contacts";

export function NotesForm({ contactId, notes }: { contactId: string; notes: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(setContactNotesAction, undefined);
  const [value, setValue] = useState(notes ?? "");
  const dirty = value.trim() !== (notes ?? "").trim();

  return (
    <form action={action}>
      <input type="hidden" name="contactId" value={contactId} />
      <textarea
        name="notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Add an internal note…"
        className="w-full resize-none rounded-xl border border-[#f0d9b8] bg-warm/10 px-3 py-2 text-xs text-[#8a5a22] outline-none placeholder:text-[#c9a36a] focus:ring-1 focus:ring-warm"
      />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {state?.ok && !dirty && <span className="text-[11px] text-emerald-600">Saved</span>}
        {dirty && (
          <button className="rounded-btn bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark">
            Save note
          </button>
        )}
      </div>
    </form>
  );
}
