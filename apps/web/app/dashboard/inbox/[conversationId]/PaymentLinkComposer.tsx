"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, Loader2 } from "lucide-react";
import { sendPaymentLinkAction, type ActionState } from "@/lib/actions/inbox";

/** Quick "send a Razorpay payment link" popover for the inbox composer. */
export function PaymentLinkComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendPaymentLinkAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state?.ok, router]);

  const inputCls =
    "w-full rounded-btn border border-line px-2.5 py-1.5 text-sm outline-none focus:border-brand";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
      >
        <IndianRupee className="h-3 w-3" /> Payment link
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-card border border-line bg-white p-3 shadow-card-lg">
          <form action={action} className="space-y-2">
            <input type="hidden" name="conversationId" value={conversationId} />
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-sub">Amount (₹)</label>
              <input name="amount" type="number" min={1} step="1" placeholder="500" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-sub">Description</label>
              <input name="description" placeholder="Order #123" className={inputCls} />
            </div>
            {state?.error && (
              <p className="rounded bg-rose/10 px-2 py-1 text-[11px] text-rose">{state.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-btn px-2.5 py-1.5 text-xs text-sub hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />} Send link
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
