"use client";

import { useActionState, useState } from "react";
import { adjustWalletAction, type WalletAdjustState } from "@/lib/actions/admin";

export function WalletAdjustForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<WalletAdjustState, FormData>(adjustWalletAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
      >
        Adjust
      </button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 rounded-card bg-canvas p-2">
      <input type="hidden" name="orgId" value={orgId} />
      <select name="direction" className="rounded-btn border border-line bg-white px-2 py-1.5 text-sm">
        <option value="credit">Credit (+)</option>
        <option value="debit">Debit (−)</option>
      </select>
      <input
        name="amountInr"
        type="number"
        min={1}
        step="0.01"
        placeholder="₹ amount"
        required
        className="w-28 rounded-btn border border-line bg-white px-2 py-1.5 text-sm"
      />
      <input
        name="note"
        placeholder="Note (optional)"
        className="min-w-[120px] flex-1 rounded-btn border border-line bg-white px-2 py-1.5 text-sm"
      />
      <button
        disabled={pending}
        className="rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        Apply
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-btn px-2 py-1.5 text-sm text-sub hover:text-ink">
        Cancel
      </button>
      {state?.error && <span className="w-full text-xs font-medium text-rose">{state.error}</span>}
      {state?.ok && <span className="w-full text-xs font-medium text-emerald-600">{state.ok}</span>}
    </form>
  );
}
