import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@watool/db";
import { isAdminIpAllowed, ipFromHeaders } from "@/lib/ip-allowlist";

/**
 * Platform (SaaS-operator) admin authorization — distinct from the per-org
 * roles. A platform admin can see and manage *every* org via /admin.
 *
 * Two ways to qualify:
 *  1. `User.isPlatformAdmin = true` in the DB (toggled from the admin Users page).
 *  2. The user's email is listed in `PLATFORM_ADMIN_EMAILS` (comma-separated env).
 *     This is the bootstrap path so the first operator can get in without
 *     hand-editing the database.
 */

export type PlatformAdmin = { userId: string; email: string; name: string | null };

/** Emails always treated as platform admins (bootstrap). */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  const allow = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/**
 * Returns the signed-in user iff they're a platform admin, else null.
 * Does not redirect — use for conditional UI (e.g. the "Admin console" link).
 */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const email = session.user.email ?? "";
  let ok = isPlatformAdminEmail(email);
  if (!ok) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPlatformAdmin: true },
    });
    ok = !!me?.isPlatformAdmin;
  }
  if (!ok) return null;

  return { userId: session.user.id, email, name: session.user.name ?? null };
}

/**
 * Like getPlatformAdmin but redirects: to /login if signed out, or to
 * /dashboard if signed in without platform-admin rights. Use it to gate the
 * /admin area and every admin server action.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Defense-in-depth IP allowlist (middleware also enforces it at the edge).
  const h = await headers();
  if (!isAdminIpAllowed(ipFromHeaders(h.get("x-forwarded-for"), h.get("x-real-ip")))) {
    redirect("/dashboard");
  }

  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  return admin;
}
