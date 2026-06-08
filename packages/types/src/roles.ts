import { z } from "zod";

/**
 * Organization roles, ordered from most to least privileged.
 * Mirrors the `Role` enum in the Prisma schema.
 */
export const ROLES = ["OWNER", "ADMIN", "AGENT", "ANALYST"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Privilege rank — higher means more access. Used for "at least" checks. */
const RANK: Record<Role, number> = {
  OWNER: 3,
  ADMIN: 2,
  AGENT: 1,
  ANALYST: 0,
};

/** True if `role` is at least as privileged as `min`. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Roles permitted to manage members / billing / settings. */
export function canManageOrg(role: Role): boolean {
  return roleAtLeast(role, "ADMIN");
}

/** Roles permitted to send/reply in the inbox. */
export function canHandleConversations(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "AGENT";
}
