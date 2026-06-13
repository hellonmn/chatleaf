"use client";

import { useActionState, useState } from "react";
import { type PlanName } from "@watool/types";
import type { PlanConfig } from "@/lib/plan-config";
import { changePlanAction, type ActionState } from "@/lib/actions/billing";
import { SubmitButton } from "@/components/SubmitButton";

export function PlanCards({
  plans,
  currentPlan,
  isOwner,
  billingLive,
}: {
  plans: PlanConfig[];
  currentPlan: PlanName;
  isOwner: boolean;
  billingLive: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    changePlanAction,
    undefined,
  );
  const [code, setCode] = useState("");

  const priceOf = (p: PlanName) => plans.find((x) => x.plan === p)?.priceInr ?? 0;
  // Hide inactive tiers unless it's the org's current plan.
  const visible = plans.filter((p) => p.active || p.plan === currentPlan);

  return (
    <div className="space-y-3">
      {billingLive && isOwner && (
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Promo code (optional)"
            className="w-56 rounded-btn border border-slate-300 px-3 py-1.5 text-sm uppercase outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          {code && <span className="text-xs text-slate-400">applied at checkout</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {visible.map((p) => {
          const current = p.plan === currentPlan;
          const isUpgrade = p.priceInr > priceOf(currentPlan);
          const cta = p.plan === "FREE" ? "Downgrade" : isUpgrade ? "Upgrade" : "Switch";
          return (
            <div
              key={p.plan}
              className={`rounded-lg border p-4 ${
                current ? "border-brand ring-1 ring-brand" : "border-slate-200"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{p.label}</h3>
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">
                    ₹{p.priceInr.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-slate-400">/mo</span>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{p.blurb}</p>
              {p.trialDays > 0 && p.priceInr > 0 && (
                <p className="mt-1 inline-block rounded-pill bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {p.trialDays}-day free trial
                </p>
              )}
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                <li>{p.seats} seats</li>
                <li>{p.contacts.toLocaleString()} contacts</li>
                <li>{p.messagesPerMonth.toLocaleString()} msgs / month</li>
                <li>{p.publishedFlows} published flows</li>
              </ul>
              <div className="mt-4">
                {current ? (
                  <div className="rounded-md bg-brand/10 py-1.5 text-center text-xs font-medium text-brand-ink">
                    Current plan
                  </div>
                ) : isOwner ? (
                  <form action={action}>
                    <input type="hidden" name="plan" value={p.plan} />
                    <input type="hidden" name="code" value={code} />
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
