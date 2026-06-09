"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type ActionState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "mt-1 w-full rounded-btn border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "block text-sm font-semibold text-ink";

export function SignupForm() {
  const [state, action] = useActionState<ActionState, FormData>(signupAction, undefined);

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Create your workspace</h1>
      <p className="mt-1 text-sm text-sub">Start managing every conversation in one place.</p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className={label} htmlFor="name">Your name</label>
          <input id="name" name="name" autoComplete="name" placeholder="Sam Rivera" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="orgName">Workspace name</label>
          <input id="orgName" name="orgName" placeholder="Northwind Co." className={field} />
        </div>
        <div>
          <label className={label} htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@agency.com" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" className={field} />
        </div>
        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        <SubmitButton className="w-full">Create workspace</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-sub">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-dark">Sign in</Link>
      </p>
    </div>
  );
}
