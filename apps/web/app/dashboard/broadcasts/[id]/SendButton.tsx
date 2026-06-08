"use client";

import { useActionState } from "react";
import { sendBroadcastAction, type ActionState } from "@/lib/actions/broadcasts";
import { SubmitButton } from "@/components/SubmitButton";

export function SendButton({ broadcastId }: { broadcastId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    sendBroadcastAction,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="broadcastId" value={broadcastId} />
      <SubmitButton>Send now</SubmitButton>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-sm text-emerald-600">{state.ok}</span>}
    </form>
  );
}
