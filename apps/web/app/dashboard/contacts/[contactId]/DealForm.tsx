"use client";

import { useActionState } from "react";
import { setContactFieldsAction, type ActionState } from "@/lib/actions/contacts";
import { SubmitButton } from "@/components/SubmitButton";

const inp =
  "mt-1 w-full rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function DealForm({
  contactId,
  source,
  value,
}: {
  contactId: string;
  source: string | null;
  value: number | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    setContactFieldsAction,
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="contactId" value={contactId} />
      <div className="w-40">
        <label className="text-xs font-medium text-faint">Source</label>
        <input name="source" defaultValue={source ?? ""} placeholder="WhatsApp Ad" className={inp} />
      </div>
      <div className="w-32">
        <label className="text-xs font-medium text-faint">Est. value (₹)</label>
        <input name="value" defaultValue={value ?? ""} placeholder="24000" className={inp} />
      </div>
      <SubmitButton>Save</SubmitButton>
      {state?.ok && <span className="text-xs text-emerald-600">{state.ok}</span>}
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
