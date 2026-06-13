"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { RoleSchema, canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { getPlanLimits } from "@/lib/plan-config";

export type ActionState = { error?: string; ok?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: RoleSchema,
});

const INVITE_TTL_DAYS = 7;

/**
 * Invite a teammate to the active org. Admins/owners only. Creates an Invite
 * row with a token. (Email delivery is a Phase 5 concern — for now the invite
 * link is shown in the UI so the flow is testable end to end.)
 */
export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "You don't have permission to invite members." };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const email = parsed.data.email.toLowerCase();

  // Already a member?
  const existingMember = await prisma.membership.findFirst({
    where: { orgId: ctx.orgId, user: { email } },
  });
  if (existingMember) return { error: "That person is already a member." };

  // Seat limit (members + outstanding invites) for the current plan.
  const [members, pendingInvites] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.invite.count({ where: { orgId: ctx.orgId, acceptedAt: null } }),
  ]);
  const seats = ctx.seatLimitOverride ?? (await getPlanLimits(ctx.plan)).seats;
  if (members + pendingInvites >= seats) {
    return {
      error: `Your ${ctx.plan} plan allows ${seats} seat(s). Upgrade in Settings → Billing to invite more.`,
    };
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  await prisma.invite.upsert({
    where: { orgId_email: { orgId: ctx.orgId, email } },
    create: {
      orgId: ctx.orgId,
      email,
      role: parsed.data.role,
      token,
      invitedBy: ctx.userId,
      expiresAt,
    },
    update: { role: parsed.data.role, token, expiresAt, acceptedAt: null },
  });

  revalidatePath("/dashboard/team");
  return { ok: `Invite created for ${email}.` };
}

const revokeSchema = z.object({ inviteId: z.string().min(1) });

/** Plain form action (no useActionState) — used directly in a <form>. */
export async function revokeInviteAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;

  const parsed = revokeSchema.safeParse({ inviteId: formData.get("inviteId") });
  if (!parsed.success) return;

  await prisma.invite.deleteMany({
    where: { id: parsed.data.inviteId, orgId: ctx.orgId },
  });
  revalidatePath("/dashboard/team");
}
