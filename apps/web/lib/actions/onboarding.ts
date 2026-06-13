"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

/**
 * Dismiss the first-run setup checklist for the active org. Owners/admins only.
 * Stored on OrgSettings so the dismissal persists across devices/browsers.
 * Plain form action (no useActionState) — used directly in a <form>.
 */
export async function dismissOnboardingAction(): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;

  await prisma.orgSettings.upsert({
    where: { orgId: ctx.orgId },
    create: { orgId: ctx.orgId, onboardingDismissedAt: new Date() },
    update: { onboardingDismissedAt: new Date() },
  });
  revalidatePath("/dashboard");
}
