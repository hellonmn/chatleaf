import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, type Role, type Plan } from "@watool/db";
import { isPlatformAdminEmail } from "@/lib/platform";

const ACTIVE_ORG_COOKIE = "watool_active_org";
const IMPERSONATE_ORG_COOKIE = "watool_impersonate_org";

export type ActiveContext = {
  userId: string;
  email: string;
  name: string | null;
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: Plan;
  role: Role;
  /** Per-org seat-limit override set by a platform admin (null = use plan default). */
  seatLimitOverride: number | null;
  /** True if the signed-in user is a SaaS-operator (platform) admin. */
  isPlatformAdmin: boolean;
  /** True when a platform admin is viewing this org via impersonation. */
  impersonating: boolean;
};

/**
 * Resolves the signed-in user and their active org. The active org is read from
 * a cookie; if unset or invalid, falls back to the user's first membership.
 * Redirects to /login if not authenticated, or /onboarding if the user has no org.
 *
 * Platform admins can additionally "impersonate" any org (via a cookie) to
 * provide support; suspended orgs bounce their own members to /suspended.
 */
export async function requireActiveContext(): Promise<ActiveContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const email = session.user.email ?? "";
  const name = session.user.name ?? null;

  // Is this user a platform (SaaS-operator) admin? Also catch deactivation of a
  // user who still holds a valid session token.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true, disabledAt: true },
  });
  if (me?.disabledAt) redirect("/login");
  const isPlatformAdmin = isPlatformAdminEmail(email) || !!me?.isPlatformAdmin;

  const cookieStore = await cookies();

  // Impersonation: a platform admin viewing an arbitrary org. Bypasses the
  // membership requirement and the suspension lock (so they can investigate).
  const impersonateOrgId = cookieStore.get(IMPERSONATE_ORG_COOKIE)?.value;
  if (impersonateOrgId && isPlatformAdmin) {
    const org = await prisma.org.findUnique({ where: { id: impersonateOrgId } });
    if (org) {
      return {
        userId,
        email,
        name,
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        plan: org.plan,
        role: "OWNER",
        seatLimitOverride: org.seatLimitOverride,
        isPlatformAdmin: true,
        impersonating: true,
      };
    }
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  // A platform admin with no workspace of their own goes to the admin console
  // rather than the "create a workspace" screen.
  if (memberships.length === 0) redirect(isPlatformAdmin ? "/admin" : "/onboarding");

  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active =
    memberships.find((m) => m.orgId === preferred) ?? memberships[0]!;

  // Suspended orgs are locked out of the app (platform admins can still reach
  // them via impersonation, handled above).
  if (active.org.suspendedAt) redirect("/suspended");

  return {
    userId,
    email,
    name,
    orgId: active.orgId,
    orgName: active.org.name,
    orgSlug: active.org.slug,
    plan: active.org.plan,
    role: active.role,
    seatLimitOverride: active.org.seatLimitOverride,
    isPlatformAdmin,
    impersonating: false,
  };
}

export { ACTIVE_ORG_COOKIE, IMPERSONATE_ORG_COOKIE };
