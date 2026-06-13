"use client";

import { useActionState } from "react";
import { savePlanConfigAction, type PlanConfigState } from "@/lib/actions/admin";
import type { PlanConfig } from "@/lib/plan-config";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

function Num({ name, label, def }: { name: string; label: string; def: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-sub">{label}</label>
      <input name={name} type="number" min={0} defaultValue={def} className={field} />
    </div>
  );
}

export function PlanConfigForm({ config }: { config: PlanConfig }) {
  const [state, action] = useActionState<PlanConfigState, FormData>(
    savePlanConfigAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="plan" value={config.plan} />
      <div className="grid grid-cols-2 gap-3">
        <Num name="priceInr" label="Price ₹/mo" def={config.priceInr} />
        <Num name="seats" label="Seats" def={config.seats} />
        <Num name="contacts" label="Contacts" def={config.contacts} />
        <Num name="messagesPerMonth" label="Messages / month" def={config.messagesPerMonth} />
        <Num name="publishedFlows" label="Published flows" def={config.publishedFlows} />
        <Num name="trialDays" label="Free trial (days)" def={config.trialDays} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Razorpay plan id</label>
          <input
            name="razorpayPlanId"
            defaultValue={config.razorpayPlanId ?? ""}
            placeholder="plan_…"
            className={field}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" name="active" defaultChecked={config.active} className="h-4 w-4 rounded border-line" />
        Offer this plan to customers
      </label>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}

      <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Save {config.label}
      </button>
    </form>
  );
}
