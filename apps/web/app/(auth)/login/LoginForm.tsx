"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "mt-1 w-full rounded-btn border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "block text-sm font-semibold text-ink";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, undefined);

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-sub">Sign in to your Chatleaf workspace.</p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className={label} htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@agency.com" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" className={field} />
        </div>
        {state?.needs2fa && (
          <div>
            <label className={label} htmlFor="code">Authenticator code</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              autoFocus
              className={field}
            />
            <p className="mt-1 text-xs text-sub">Enter the code from your authenticator app.</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-sub">
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-line text-brand focus:ring-brand" />
            Remember me
          </label>
          <Link href="/login" className="text-sm font-semibold text-brand hover:text-brand-dark">
            Forgot password?
          </Link>
        </div>
        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-line" /> or continue with <span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        title="Google sign-in coming soon"
        className="flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-white py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
      >
        <GoogleIcon /> Google
      </button>

      <p className="mt-5 text-center text-sm text-sub">
        New to Chatleaf?{" "}
        <Link href="/signup" className="font-semibold text-brand-dark">Create an account</Link>
      </p>
    </div>
  );
}
