"use client";

import { useActionState } from "react";
import {
  PLANS,
  PLAN_LIMITS,
  PLAN_PRICING,
  type PlanName,
} from "@watool/types";
import { changePlanAction, type ActionState } from "@/lib/actions/billing";
import { SubmitButton } from "@/components/SubmitButton";

export function PlanCards({
  currentPlan,
  isOwner,
  billingLive,
}: {
  currentPlan: PlanName;
  isOwner: boolean;
  billingLive: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    changePlanAction,
    undefined,
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const price = PLAN_PRICING[plan];
          const current = plan === currentPlan;
          const isUpgrade = price.priceInr > PLAN_PRICING[currentPlan].priceInr;
          const cta = plan === "FREE" ? "Downgrade" : isUpgrade ? "Upgrade" : "Switch";
          return (
            <div
              key={plan}
              className={`rounded-lg border p-4 ${
                current ? "border-brand ring-1 ring-brand" : "border-slate-200"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{price.label}</h3>
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">
                    ₹{price.priceInr.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-slate-400">/mo</span>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{price.blurb}</p>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                <li>{limits.seats} seats</li>
                <li>{limits.contacts.toLocaleString()} contacts</li>
                <li>{limits.messagesPerMonth.toLocaleString()} msgs / month</li>
                <li>{limits.publishedFlows} published flows</li>
              </ul>
              <div className="mt-4">
                {current ? (
                  <div className="rounded-md bg-brand/10 py-1.5 text-center text-xs font-medium text-brand-ink">
                    Current plan
                  </div>
                ) : isOwner ? (
                  <form action={action}>
                    <input type="hidden" name="plan" value={plan} />
                    <SubmitButton className="w-full">{cta}</SubmitButton>
                  </form>
                ) : (
                  <div className="py-1.5 text-center text-xs text-slate-400">Owner only</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}
      <p className="text-xs text-slate-400">
        {billingLive
          ? "Upgrades open Razorpay's secure checkout; your plan activates once payment is confirmed. Downgrading to Free cancels your subscription."
          : "Razorpay isn't configured yet, so plan switches apply instantly (test mode). Set the RAZORPAY_* env vars to enable real billing."}
      </p>
    </div>
  );
}
