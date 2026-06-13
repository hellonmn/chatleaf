import { prisma, Prisma } from "@watool/db";
import type { PlatformAdmin } from "@/lib/platform";

export type AuditTargetType = "org" | "user";

/**
 * Record a platform-admin action. Best-effort: a logging failure must never
 * break the underlying action, so errors are swallowed (and logged to console).
 */
export async function logAdminAction(opts: {
  actor: PlatformAdmin;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: opts.actor.userId,
        actorEmail: opts.actor.email,
        action: opts.action,
        targetType: opts.targetType,
        targetId: opts.targetId,
        targetLabel: opts.targetLabel ?? null,
        metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record admin action:", err);
  }
}
