"use client";

import { useActionState } from "react";
import { syncTemplatesAction, type ActionState } from "@/lib/actions/templates";
import { SubmitButton } from "@/components/SubmitButton";

export function SyncButton() {
  const [state, action] = useActionState<ActionState, FormData>(
    syncTemplatesAction,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <SubmitButton>Sync from Meta</SubmitButton>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-sm text-emerald-600">{state.ok}</span>}
    </form>
  );
}
