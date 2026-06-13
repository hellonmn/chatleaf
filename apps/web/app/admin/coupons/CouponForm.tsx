"use client";

import { useActionState } from "react";
import { saveCouponAction, type CouponState } from "@/lib/actions/admin";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function CouponForm() {
  const [state, action] = useActionState<CouponState, FormData>(saveCouponAction, undefined);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Code</label>
          <input name="code" placeholder="WELCOME20" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Razorpay offer id</label>
          <input name="razorpayOfferId" placeholder="offer_…" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Description</label>
          <input name="description" placeholder="20% off first 3 months" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Max redemptions</label>
            <input name="maxRedemptions" type="number" min={1} placeholder="∞" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Expires</label>
            <input name="expiresAt" type="date" className={field} />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        The discount itself is configured as an Offer in Razorpay; paste its id here to
        apply it at checkout when this code is entered.
      </p>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}

      <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Save coupon
      </button>
    </form>
  );
}
