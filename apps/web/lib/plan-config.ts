import { cache } from "react";
import { prisma } from "@watool/db";
import {
  PLANS,
  PLAN_LIMITS,
  PLAN_PRICING,
  type PlanName,
  type PlanLimits,
} from "@watool/types";

/**
 * Effective plan config = admin overrides (PlanConfig table) layered over the
 * hardcoded defaults in @watool/types. Lets the operator tune pricing, limits,
 * and the Razorpay plan id without a deploy. Request-cached.
 */
export type PlanConfig = {
  plan: PlanName;
  label: string;
  blurb: string;
  priceInr: number;
  seats: number;
  contacts: number;
  messagesPerMonth: number;
  publishedFlows: number;
  razorpayPlanId: string | null;
  trialDays: number;
  active: boolean;
};

function envPlanId(plan: PlanName): string | null {
  if (plan === "STARTER") return process.env.RAZORPAY_PLAN_STARTER || null;
  if (plan === "PRO") return process.env.RAZORPAY_PLAN_PRO || null;
  return null;
}

export const getPlanConfigs = cache(async (): Promise<Record<PlanName, PlanConfig>> => {
  const rows = await prisma.planConfig.findMany();
  const byPlan = new Map(rows.map((r) => [r.plan, r]));
  const out = {} as Record<PlanName, PlanConfig>;
  for (const p of PLANS) {
    const r = byPlan.get(p);
    const limits = PLAN_LIMITS[p];
    const pricing = PLAN_PRICING[p];
    out[p] = {
      plan: p,
      label: pricing.label,
      blurb: pricing.blurb,
      priceInr: r?.priceInr ?? pricing.priceInr,
      seats: r?.seats ?? limits.seats,
      contacts: r?.contacts ?? limits.contacts,
      messagesPerMonth: r?.messagesPerMonth ?? limits.messagesPerMonth,
      publishedFlows: r?.publishedFlows ?? limits.publishedFlows,
      razorpayPlanId: r?.razorpayPlanId ?? envPlanId(p),
      trialDays: r?.trialDays ?? 0,
      active: r?.active ?? true,
    };
  }
  return out;
});

export async function getPlanConfig(plan: PlanName): Promise<PlanConfig> {
  return (await getPlanConfigs())[plan];
}

/** Just the limits slice, for consumers that previously used planLimits(). */
export async function getPlanLimits(plan: PlanName): Promise<PlanLimits> {
  const c = await getPlanConfig(plan);
  return {
    seats: c.seats,
    contacts: c.contacts,
    messagesPerMonth: c.messagesPerMonth,
    publishedFlows: c.publishedFlows,
  };
}
