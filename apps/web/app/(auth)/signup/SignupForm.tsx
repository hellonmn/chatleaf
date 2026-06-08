"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type ActionState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "block text-sm font-medium text-slate-700";

export function SignupForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">
        Create your workspace
      </h1>

      <div>
        <label className={label} htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className={field} autoComplete="name" />
      </div>

      <div>
        <label className={label} htmlFor="orgName">
          Workspace name
        </label>
        <input
          id="orgName"
          name="orgName"
          className={field}
          placeholder="Acme Inc."
        />
      </div>

      <div>
        <label className={label} htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className={field}
          autoComplete="email"
        />
      </div>

      <div>
        <label className={label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className={field}
          autoComplete="new-password"
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton className="w-full">Create workspace</SubmitButton>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-dark">
          Sign in
        </Link>
      </p>
    </form>
  );
}
