import { createHmac, timingSafeEqual } from "crypto";
import type { PlanName } from "@watool/types";

/**
 * Razorpay billing helpers (server-only). Uses the REST API directly (Basic
 * auth) — no SDK dependency. Everything is gated on env: when keys/plan-ids are
 * missing, `razorpayConfigured()` is false and the billing UI falls back to the
 * instant test-mode switch.
 *
 * Setup: create one Razorpay Plan per paid tier in the Razorpay dashboard, then
 * set RAZORPAY_PLAN_STARTER / RAZORPAY_PLAN_PRO to those plan ids.
 */

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return (
    !!process.env.RAZORPAY_KEY_ID &&
    !!process.env.RAZORPAY_KEY_SECRET &&
    (!!process.env.RAZORPAY_PLAN_STARTER || !!process.env.RAZORPAY_PLAN_PRO)
  );
}

/** Razorpay plan id for one of our tiers (FREE has none). */
export function razorpayPlanId(plan: PlanName): string | undefined {
  if (plan === "STARTER") return process.env.RAZORPAY_PLAN_STARTER || undefined;
  if (plan === "PRO") return process.env.RAZORPAY_PLAN_PRO || undefined;
  return undefined;
}

/** Reverse-map a Razorpay plan id back to our tier (for webhook handling). */
export function planFromRazorpayId(planId: string | undefined): PlanName | null {
  if (!planId) return null;
  if (planId === process.env.RAZORPAY_PLAN_STARTER) return "STARTER";
  if (planId === process.env.RAZORPAY_PLAN_PRO) return "PRO";
  return null;
}

function authHeader(): string {
  const token = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${token}`;
}

type RazorpaySubscription = {
  id: string;
  status: string;
  short_url: string;
  plan_id: string;
  customer_id?: string;
  current_end?: number | null;
  notes?: Record<string, string>;
};

/** Create a subscription for a plan id. `total_count` is the max billing cycles. */
export async function createRazorpaySubscription(opts: {
  planId: string;
  orgId: string;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const res = await fetch(`${API}/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader() },
    body: JSON.stringify({
      plan_id: opts.planId,
      total_count: 120, // ~10 years of monthly cycles
      quantity: 1,
      customer_notify: 1,
      notes: { orgId: opts.orgId, ...opts.notes },
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay createSubscription failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RazorpaySubscription;
}

/** Cancel a subscription immediately. */
export async function cancelRazorpaySubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader() },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  if (!res.ok && res.status !== 400) {
    // 400 = already cancelled / not cancellable; treat as done.
    throw new Error(`Razorpay cancel failed (${res.status}): ${await res.text()}`);
  }
}

/** Verify the X-Razorpay-Signature header against the raw webhook body. */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
