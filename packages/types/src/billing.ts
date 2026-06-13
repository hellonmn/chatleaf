/**
 * Plan limits. Multi-tenant SaaS gates usage by plan; these are the ceilings
 * enforced across the app (seats on invite, flows on publish, messages on send).
 * Tune freely — pricing lives on top of these.
 */
export const PLANS = ["FREE", "STARTER", "PRO"] as const;
export type PlanName = (typeof PLANS)[number];

export type PlanLimits = {
  seats: number;
  contacts: number;
  messagesPerMonth: number;
  publishedFlows: number;
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: { seats: 2, contacts: 500, messagesPerMonth: 1_000, publishedFlows: 1 },
  STARTER: { seats: 5, contacts: 5_000, messagesPerMonth: 10_000, publishedFlows: 10 },
  PRO: { seats: 25, contacts: 50_000, messagesPerMonth: 100_000, publishedFlows: 100 },
};

export const PLAN_PRICING: Record<
  PlanName,
  { label: string; priceUsd: number; priceInr: number; blurb: string }
> = {
  FREE: { label: "Free", priceUsd: 0, priceInr: 0, blurb: "Kick the tyres" },
  STARTER: { label: "Starter", priceUsd: 29, priceInr: 2400, blurb: "For small teams" },
  PRO: { label: "Pro", priceUsd: 99, priceInr: 8000, blurb: "For growing businesses" },
};

export function planLimits(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** True if `used` is at or over the plan ceiling for that resource. */
export function isOverLimit(used: number, limit: number): boolean {
  return used >= limit;
}
