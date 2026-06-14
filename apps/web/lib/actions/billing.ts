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
} from "@/lib/razorpay";
import { getPlanConfig } from "@/lib/plan-config";

export type ActionState = { error?: string; ok?: string } | undefined;

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
