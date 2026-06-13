"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import {
  resetUserPasswordAction,
  type ResetPasswordState,
} from "@/lib/actions/admin";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, action] = useActionState<ResetPasswordState, FormData>(
    resetUserPasswordAction,
    undefined,
  );

  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <button className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">
          <KeyRound className="h-4 w-4" /> Reset password
        </button>
      </form>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.password && (
        <div className="rounded-card border border-line bg-canvas p-3">
          <div className="text-xs font-semibold text-sub">{state.ok}</div>
          <div className="mt-1.5 text-xs text-faint">
            Copy this now — it won&apos;t be shown again. Share it securely and have
            them change it.
          </div>
          <code className="mt-2 block select-all break-all rounded-md bg-white px-3 py-2 text-sm font-bold text-ink">
            {state.password}
          </code>
        </div>
      )}
    </div>
  );
}
