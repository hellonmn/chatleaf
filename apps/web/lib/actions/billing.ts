"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@watool/db";
import { PLANS } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import {
  razorpayConfigured,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  getRazorpayCreds,
  verifySubscriptionPayment,
} from "@/lib/razorpay";
import { getPlanConfig } from "@/lib/plan-config";
import { createInvoiceForCharge } from "@/lib/invoices";

export type ActionState = { error?: string; ok?: string } | undefined;

export type CheckoutState =
  | { error?: string; subscriptionId?: string; keyId?: string }
  | undefined;

/**
 * Create a Razorpay subscription for an in-app (embedded) checkout — returns the
 * subscription id + public key for the Razorpay Checkout modal, WITHOUT
 * redirecting to Razorpay's hosted page. The webhook activates the plan on
 * payment. Owner-only; paid plans only.
 */
export async function createCheckoutSubscriptionAction(
  planRaw: string,
  codeRaw: string,
): Promise<CheckoutState> {
  const ctx = await requireActiveContext();
  if (ctx.role !== "OWNER") return { error: "Only the workspace owner can change the plan." };

  const parsed = z.enum(PLANS).safeParse(planRaw);
  if (!parsed.success || parsed.data === "FREE") return { error: "Invalid plan." };
  const plan = parsed.data;
  if (!(await razorpayConfigured())) return { error: "Billing isn't configured." };

  const config = await getPlanConfig(plan);
  if (!config.razorpayPlanId) {
    return { error: `The ${plan} plan isn't wired to a Razorpay plan id yet.` };
  }

  const code = String(codeRaw ?? "").trim().toUpperCase();
  let coupon: { id: string; razorpayOfferId: string | null } | null = null;
  if (code) {
    const c = await prisma.coupon.findUnique({ where: { code } });
    if (!c || !c.active) return { error: "That promo code isn't valid." };
    if (c.expiresAt && c.expiresAt.getTime() < Date.now()) return { error: "That promo code has expired." };
    if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) {
      return { error: "That promo code has reached its redemption limit." };
    }
    coupon = { id: c.id, razorpayOfferId: c.razorpayOfferId };
  }

  const startAt =
    config.trialDays > 0 ? Math.floor(Date.now() / 1000) + config.trialDays * 86_400 : null;

  try {
    const sub = await createRazorpaySubscription({
      planId: config.razorpayPlanId,
      orgId: ctx.orgId,
      offerId: coupon?.razorpayOfferId ?? null,
      startAt,
      notes: { plan },
    });
    await prisma.subscription.upsert({
      where: { orgId: ctx.orgId },
      create: { orgId: ctx.orgId, razorpaySubscriptionId: sub.id, plan, status: sub.status || "created" },
      update: { razorpaySubscriptionId: sub.id, plan, status: sub.status || "created" },
    });
    if (coupon) {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
    }
    const { keyId } = await getRazorpayCreds();
    return { subscriptionId: sub.id, keyId: keyId ?? undefined };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout." };
  }
}

export type ConfirmState = { error?: string; invoiceId?: string } | undefined;

/**
 * Confirm an in-app checkout from the Razorpay success callback: verify the
 * signature, activate the plan immediately (so the UI updates without waiting on
 * the webhook), and issue the GST invoice. Idempotent.
 */
export async function confirmCheckoutAction(opts: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): Promise<ConfirmState> {
  const ctx = await requireActiveContext();

  const sub = await prisma.subscription.findUnique({ where: { orgId: ctx.orgId } });
  if (!sub || sub.razorpaySubscriptionId !== opts.subscriptionId) {
    return { error: "Subscription not found for this workspace." };
  }

  const ok = await verifySubscriptionPayment({
    paymentId: opts.paymentId,
    subscriptionId: opts.subscriptionId,
    signature: opts.signature,
  });
  if (!ok) return { error: "Payment could not be verified." };

  await prisma.$transaction([
    prisma.org.update({ where: { id: ctx.orgId }, data: { plan: sub.plan } }),
    prisma.subscription.update({ where: { orgId: ctx.orgId }, data: { status: "active" } }),
  ]);

  const config = await getPlanConfig(sub.plan);
  const invoiceId = await createInvoiceForCharge({
    orgId: ctx.orgId,
    totalPaise: config.priceInr * 100,
    description: `${sub.plan} plan subscription`,
    razorpayPaymentId: opts.paymentId,
  });

  revalidatePath("/dashboard/settings/billing");
  return { invoiceId: invoiceId ?? undefined };
}

const schema = z.object({ plan: z.enum(PLANS) });

/**
 * Change the org's plan (owner-only).
 * - To FREE: cancel any active Razorpay subscription and downgrade.
 * - To a paid plan with Razorpay configured: create a subscription and redirect
 *   to Razorpay's hosted checkout. The webhook flips Org.plan once it activates.
 * - To a paid plan WITHOUT Razorpay configured: switch instantly (test mode) so
 *   plan limits stay testable without keys.
 */
export async function changePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (ctx.role !== "OWNER") {
    return { error: "Only the workspace owner can change the plan." };
  }
  const parsed = schema.safeParse({ plan: formData.get("plan") });
  if (!parsed.success) return { error: "Invalid plan." };
  const plan = parsed.data.plan;
  if (plan === ctx.plan) return { ok: `You're already on the ${plan} plan.` };

  // ── Downgrade to Free: cancel the subscription, drop to FREE ──────────────
  if (plan === "FREE") {
    const sub = await prisma.subscription.findUnique({ where: { orgId: ctx.orgId } });
    if (sub?.razorpaySubscriptionId && (await razorpayConfigured())) {
      try {
        await cancelRazorpaySubscription(sub.razorpaySubscriptionId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Could not cancel subscription." };
      }
    }
    await prisma.$transaction([
      prisma.org.update({ where: { id: ctx.orgId }, data: { plan: "FREE" } }),
      ...(sub
        ? [prisma.subscription.update({ where: { orgId: ctx.orgId }, data: { status: "cancelled" } })]
        : []),
    ]);
    revalidatePath("/dashboard/settings/billing");
    return { ok: "Downgraded to the Free plan." };
  }

  // ── Paid plan, no Razorpay keys: instant switch (test mode) ───────────────
  if (!(await razorpayConfigured())) {
    await prisma.org.update({ where: { id: ctx.orgId }, data: { plan } });
    revalidatePath("/dashboard/settings/billing");
    return { ok: `(test mode) Switched to the ${plan} plan. Configure Razorpay for real billing.` };
  }

  // ── Paid plan with Razorpay: create a subscription + redirect to checkout ──
  const config = await getPlanConfig(plan);
  const planId = config.razorpayPlanId;
  if (!planId) {
    return { error: `The ${plan} plan isn't wired to a Razorpay plan id yet.` };
  }

  // Optional promo code → Razorpay offer.
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  let coupon: { id: string; razorpayOfferId: string | null } | null = null;
  if (code) {
    const c = await prisma.coupon.findUnique({ where: { code } });
    if (!c || !c.active) return { error: "That promo code isn't valid." };
    if (c.expiresAt && c.expiresAt.getTime() < Date.now()) return { error: "That promo code has expired." };
    if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) {
      return { error: "That promo code has reached its redemption limit." };
    }
    coupon = { id: c.id, razorpayOfferId: c.razorpayOfferId };
  }

  // Free trial → delay the first charge.
  const startAt =
    config.trialDays > 0 ? Math.floor(Date.now() / 1000) + config.trialDays * 86_400 : null;

  let shortUrl: string;
  try {
    const sub = await createRazorpaySubscription({
      planId,
      orgId: ctx.orgId,
      offerId: coupon?.razorpayOfferId ?? null,
      startAt,
      notes: { plan },
    });
    await prisma.subscription.upsert({
      where: { orgId: ctx.orgId },
      create: {
        orgId: ctx.orgId,
        razorpaySubscriptionId: sub.id,
        plan,
        status: sub.status || "created",
      },
      update: { razorpaySubscriptionId: sub.id, plan, status: sub.status || "created" },
    });
    if (coupon) {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
    }
    shortUrl = sub.short_url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout." };
  }

  redirect(shortUrl); // → Razorpay hosted checkout; webhook activates the plan
}
