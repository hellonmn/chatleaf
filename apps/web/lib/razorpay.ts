import { createHmac, timingSafeEqual } from "crypto";
import { cache } from "react";
import { prisma } from "@watool/db";
import { decryptSecret } from "@watool/wa";
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

/** Resolved Razorpay credentials: admin-set (DB, encrypted) over env fallback. */
export const getRazorpayCreds = cache(async () => {
  const s = await prisma.platformSettings.findUnique({
    where: { id: "global" },
    select: { razorpayKeyId: true, razorpayKeySecretEnc: true, razorpayWebhookSecretEnc: true },
  });
  return {
    keyId: s?.razorpayKeyId || process.env.RAZORPAY_KEY_ID || null,
    keySecret: s?.razorpayKeySecretEnc
      ? decryptSecret(s.razorpayKeySecretEnc)
      : process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: s?.razorpayWebhookSecretEnc
      ? decryptSecret(s.razorpayWebhookSecretEnc)
      : process.env.RAZORPAY_WEBHOOK_SECRET || null,
  };
});

export async function razorpayConfigured(): Promise<boolean> {
  const { keyId, keySecret } = await getRazorpayCreds();
  return !!keyId && !!keySecret;
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

async function authHeader(): Promise<string> {
  const { keyId, keySecret } = await getRazorpayCreds();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
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
  offerId?: string | null;
  /** Unix seconds to delay the first charge (free trial). */
  startAt?: number | null;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const res = await fetch(`${API}/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: await authHeader() },
    body: JSON.stringify({
      plan_id: opts.planId,
      total_count: 120, // ~10 years of monthly cycles
      quantity: 1,
      customer_notify: 1,
      ...(opts.offerId ? { offer_id: opts.offerId } : {}),
      ...(opts.startAt ? { start_at: opts.startAt } : {}),
      notes: { orgId: opts.orgId, ...opts.notes },
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay createSubscription failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RazorpaySubscription;
}

type RazorpayPaymentLink = { id: string; short_url: string; status: string };

/** Create a Razorpay Payment Link (amount in paise). We notify via our own
 *  WhatsApp message, so Razorpay's own SMS/email notifications stay off. */
export async function createRazorpayPaymentLink(opts: {
  amountPaise: number;
  description?: string;
  customerName?: string | null;
  customerContact?: string | null;
  notes?: Record<string, string>;
}): Promise<RazorpayPaymentLink> {
  const res = await fetch(`${API}/payment_links`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: await authHeader() },
    body: JSON.stringify({
      amount: opts.amountPaise,
      currency: "INR",
      description: opts.description || "Payment",
      ...(opts.customerName || opts.customerContact
        ? {
            customer: {
              ...(opts.customerName ? { name: opts.customerName } : {}),
              ...(opts.customerContact ? { contact: opts.customerContact } : {}),
            },
          }
        : {}),
      notify: { sms: false, email: false },
      reminder_enable: true,
      notes: opts.notes ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay payment link failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RazorpayPaymentLink;
}

/** Cancel a subscription immediately. */
export async function cancelRazorpaySubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: await authHeader() },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  if (!res.ok && res.status !== 400) {
    // 400 = already cancelled / not cancellable; treat as done.
    throw new Error(`Razorpay cancel failed (${res.status}): ${await res.text()}`);
  }
}

/** Verify the X-Razorpay-Signature header against the raw webhook body. */
export async function verifyRazorpayWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  const { webhookSecret: secret } = await getRazorpayCreds();
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
