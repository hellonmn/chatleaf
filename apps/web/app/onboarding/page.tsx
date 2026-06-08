"use client";

import { useActionState } from "react";
import { createOrgAction, type ActionState } from "@/lib/actions/org";
import { SubmitButton } from "@/components/SubmitButton";

export default function OnboardingPage() {
  const [state, action] = useActionState<ActionState, FormData>(
    createOrgAction,
    undefined,
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        action={action}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">
          Create a workspace
        </h1>
        <p className="text-sm text-slate-500">
          You&apos;re signed in but don&apos;t belong to a workspace yet.
        </p>
        <input
          name="orgName"
          placeholder="Acme Inc."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <SubmitButton className="w-full">Create workspace</SubmitButton>
      </form>
    </div>
  );
}
