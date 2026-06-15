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

/** Resolved Razorpay credentials for the active mode (test/live): admin-set
 *  (DB, encrypted) over env fallback. */
export const getRazorpayCreds = cache(async () => {
  const s = await prisma.platformSettings.findUnique({ where: { id: "global" } });
  const live = s?.razorpayMode === "live";
  const keyId = live ? s?.razorpayLiveKeyId : s?.razorpayTestKeyId;
  const keySecretEnc = live ? s?.razorpayLiveKeySecretEnc : s?.razorpayTestKeySecretEnc;
  const webhookSecretEnc = live ? s?.razorpayLiveWebhookSecretEnc : s?.razorpayTestWebhookSecretEnc;
  return {
    mode: live ? "live" : "test",
    keyId: keyId || process.env.RAZORPAY_KEY_ID || null,
    keySecret: keySecretEnc ? decryptSecret(keySecretEnc) : process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: webhookSecretEnc
      ? decryptSecret(webhookSecretEnc)
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

export type RazorpayMethods = {
  card: boolean;
  upi: boolean;
  netbanking: { code: string; name: string }[];
  wallets: { code: string; name: string }[];
};

function prettify(code: string): string {
  return code.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Live payment methods enabled for the account, via Razorpay's public
 * `preferences` endpoint (key_id only — no secret). Returns null on any failure
 * so the UI can fall back to a default set.
 */
export const getRazorpayMethods = cache(async (): Promise<RazorpayMethods | null> => {
  const { keyId } = await getRazorpayCreds();
  if (!keyId) return null;
  try {
    const res = await fetch(`${API}/preferences?key_id=${encodeURIComponent(keyId)}`);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = (await res.json())?.methods ?? {};

    const netbanking =
      m.netbanking && typeof m.netbanking === "object"
        ? Object.entries(m.netbanking).map(([code, name]) => ({ code, name: String(name) }))
        : [];

    let wallets: { code: string; name: string }[] = [];
    if (Array.isArray(m.wallet)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wallets = m.wallet.map((w: any) =>
        typeof w === "string" ? { code: w, name: prettify(w) } : { code: w.method ?? w.code, name: w.name ?? prettify(w.method ?? w.code) },
      );
    } else if (m.wallet && typeof m.wallet === "object") {
      wallets = Object.entries(m.wallet)
        .filter(([, v]) => v)
        .map(([code, v]) => ({ code, name: typeof v === "string" ? v : prettify(code) }));
    }

    return { card: !!m.card, upi: !!m.upi, netbanking, wallets };
  } catch {
    return null;
  }
});

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

/**
 * Verify a subscription Checkout success callback. Razorpay signs
 * `payment_id + "|" + subscription_id` with the key secret. Lets us activate the
 * plan immediately (rather than waiting on the webhook).
 */
export async function verifySubscriptionPayment(opts: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): Promise<boolean> {
  const { keySecret } = await getRazorpayCreds();
  if (!keySecret) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${opts.paymentId}|${opts.subscriptionId}`)
    .digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(opts.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
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
