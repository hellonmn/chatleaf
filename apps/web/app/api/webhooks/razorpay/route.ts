import { NextResponse } from "next/server";
import { prisma, type Plan } from "@watool/db";
import { PLANS } from "@watool/types";
import { logger, captureError, notify } from "@watool/observability";
import { verifyRazorpayWebhook, planFromRazorpayId } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubEntity = {
  id: string;
  plan_id?: string;
  status?: string;
  current_end?: number | null;
  notes?: Record<string, string>;
};

async function resolveOrgId(sub: SubEntity | undefined): Promise<string | null> {
  if (!sub) return null;
  const row = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: sub.id },
    select: { orgId: true },
  });
  return row?.orgId ?? sub.notes?.orgId ?? null;
}

function planFor(sub: SubEntity | undefined): Plan | null {
  const byId = planFromRazorpayId(sub?.plan_id);
  if (byId) return byId;
  const note = sub?.notes?.plan;
  return note && (PLANS as readonly string[]).includes(note) ? (note as Plan) : null;
}

/**
 * Razorpay webhook. Verifies the signature, then keeps Org.plan + Subscription
 * in sync with the subscription lifecycle. Always returns 200 (after auth) so
 * Razorpay doesn't disable the webhook over a transient error.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    logger.warn("razorpay webhook signature invalid");
    return new Response("Invalid signature", { status: 401 });
  }

  let body: { event?: string; payload?: Record<string, { entity?: SubEntity }> };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = body.event ?? "";
  const sub = body.payload?.subscription?.entity;

  try {
    switch (event) {
      case "subscription.authenticated": // mandate set up (grants trial access)
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.resumed": {
        const orgId = await resolveOrgId(sub);
        const plan = planFor(sub);
        if (orgId && plan) {
          const currentEnd = sub?.current_end ? new Date(sub.current_end * 1000) : null;
          await prisma.$transaction([
            prisma.org.update({ where: { id: orgId }, data: { plan } }),
            prisma.subscription.upsert({
              where: { orgId },
              create: { orgId, plan, razorpaySubscriptionId: sub!.id, status: "active", currentEnd },
              update: { plan, status: "active", currentEnd, razorpaySubscriptionId: sub!.id },
            }),
          ]);
          logger.info("subscription active", { orgId, plan, event });
        }
        break;
      }

      case "subscription.halted":
      case "subscription.cancelled":
      case "subscription.completed": {
        const orgId = await resolveOrgId(sub);
        if (orgId) {
          const status = event.split(".")[1]!; // halted|cancelled|completed
          await prisma.$transaction([
            prisma.org.update({ where: { id: orgId }, data: { plan: "FREE" } }),
            prisma.subscription.updateMany({ where: { orgId }, data: { status } }),
          ]);
          logger.info("subscription ended → downgraded to FREE", { orgId, event });
          if (event === "subscription.halted") {
            const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
            await notify({
              title: "Subscription halted (payment failed)",
              message: `${org?.name ?? orgId}'s subscription was halted after failed payments — downgraded to Free.`,
              level: "critical",
              fields: { orgId, org: org?.name ?? "—" },
            });
          }
        }
        break;
      }

      case "payment.failed": {
        await notify({
          title: "Razorpay payment failed",
          message: "A subscription payment attempt failed.",
          level: "warning",
        });
        break;
      }

      default:
        logger.debug("razorpay webhook ignored", { event });
    }
  } catch (err) {
    captureError(err, { scope: "razorpay.webhook", event });
  }

  return NextResponse.json({ received: true });
}
