import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, type Role, type Plan } from "@watool/db";

const ACTIVE_ORG_COOKIE = "watool_active_org";

export type ActiveContext = {
  userId: string;
  email: string;
  name: string | null;
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: Plan;
  role: Role;
};

/**
 * Resolves the signed-in user and their active org. The active org is read from
 * a cookie; if unset or invalid, falls back to the user's first membership.
 * Redirects to /login if not authenticated, or /onboarding if the user has no org.
 */
export async function requireActiveContext(): Promise<ActiveContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active =
    memberships.find((m) => m.orgId === preferred) ?? memberships[0]!;

  return {
    userId,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    orgId: active.orgId,
    orgName: active.org.name,
    orgSlug: active.org.slug,
    plan: active.org.plan,
    role: active.role,
  };
}

export { ACTIVE_ORG_COOKIE };
