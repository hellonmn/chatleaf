"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  addPlatformAdminByEmailAction,
  type AdminActionState,
} from "@/lib/actions/admin";

export function AddAdminForm() {
  const [state, action] = useActionState<AdminActionState, FormData>(
    addPlatformAdminByEmailAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          placeholder="person@company.com"
          className="flex-1 rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <button className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90">
          <ShieldCheck className="h-4 w-4" /> Grant platform admin
        </button>
      </div>
      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}
    </form>
  );
}
