"use client";

import { useActionState } from "react";
import { inviteMemberAction, type ActionState } from "@/lib/actions/team";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function InviteForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    inviteMemberAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="email"
          type="email"
          placeholder="teammate@company.com"
          className={`${field} flex-1`}
        />
        <select name="role" defaultValue="AGENT" className={field}>
          <option value="ADMIN">Admin</option>
          <option value="AGENT">Agent</option>
          <option value="ANALYST">Analyst</option>
        </select>
        <SubmitButton>Send invite</SubmitButton>
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.ok}
        </p>
      )}
    </form>
  );
}
