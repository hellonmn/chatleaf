"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { PLANS } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ActionState = { error?: string; ok?: string } | undefined;

const schema = z.object({ plan: z.enum(PLANS) });

/**
 * Switch the org's plan. In production this is the callback after a successful
 * Stripe Checkout / subscription change; here it's a direct switch (owner-only)
 * so plan limits are testable without Stripe keys.
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

  await prisma.org.update({
    where: { id: ctx.orgId },
    data: { plan: parsed.data.plan },
  });
  revalidatePath("/dashboard/settings/billing");
  return { ok: `Switched to the ${parsed.data.plan} plan.` };
}
