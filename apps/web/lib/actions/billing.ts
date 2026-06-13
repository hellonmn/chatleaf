"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@watool/db";
import { PLANS } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import {
  razorpayConfigured,
  razorpayPlanId,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
} from "@/lib/razorpay";

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
    if (sub?.razorpaySubscriptionId && razorpayConfigured()) {
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
  if (!razorpayConfigured()) {
    await prisma.org.update({ where: { id: ctx.orgId }, data: { plan } });
    revalidatePath("/dashboard/settings/billing");
    return { ok: `(test mode) Switched to the ${plan} plan. Configure Razorpay for real billing.` };
  }

  // ── Paid plan with Razorpay: create a subscription + redirect to checkout ──
  const planId = razorpayPlanId(plan);
  if (!planId) {
    return { error: `The ${plan} plan isn't wired to a Razorpay plan id yet.` };
  }

  let shortUrl: string;
  try {
    const sub = await createRazorpaySubscription({ planId, orgId: ctx.orgId, notes: { plan } });
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
    shortUrl = sub.short_url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout." };
  }

  redirect(shortUrl); // → Razorpay hosted checkout; webhook activates the plan
}
