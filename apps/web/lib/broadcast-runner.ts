import { prisma } from "@watool/db";
import { sendBroadcast, audienceWhere, type AudienceFilter } from "@watool/processing";
import { startOfMonth } from "@/lib/usage";
import { getPlanLimits } from "@/lib/plan-config";

/**
 * Dispatch any broadcasts whose schedule is due. Each is atomically claimed
 * (SCHEDULED → RUNNING) so concurrent cron hits never double-send. Enforces the
 * org's monthly message quota; over-quota sends are marked FAILED rather than
 * retried forever. Called by the cron endpoint.
 */
export async function sendDueBroadcasts(): Promise<{
  due: number;
  ran: number;
  sent: number;
  failed: number;
}> {
  const due = await prisma.broadcast.findMany({
    where: { status: "SCHEDULED", scheduleAt: { lte: new Date() } },
    include: { org: true, segment: true },
    take: 50,
  });

  let ran = 0;
  let sent = 0;
  let failed = 0;

  for (const b of due) {
    // Claim it — only one worker wins the SCHEDULED → RUNNING transition.
    const claim = await prisma.broadcast.updateMany({
      where: { id: b.id, status: "SCHEDULED" },
      data: { status: "RUNNING" },
    });
    if (claim.count !== 1) continue;

    try {
      const filter = (b.segment?.filterJSON as AudienceFilter) ?? { optedInOnly: true };
      const [used, audience] = await Promise.all([
        prisma.message.count({
          where: { orgId: b.orgId, direction: "OUT", createdAt: { gte: startOfMonth() } },
        }),
        prisma.contact.count({ where: audienceWhere(b.orgId, filter) }),
      ]);

      const quota = (await getPlanLimits(b.org.plan)).messagesPerMonth;
      if (used + audience > quota) {
        await prisma.broadcast.update({
          where: { id: b.id },
          data: { status: "FAILED", stats: { error: "Monthly message quota exceeded" } },
        });
        failed++;
        continue;
      }

      const r = await sendBroadcast(b.id);
      ran++;
      sent += r.sent;
    } catch (err) {
      await prisma.broadcast
        .update({
          where: { id: b.id },
          data: { status: "FAILED", stats: { error: err instanceof Error ? err.message : "send failed" } },
        })
        .catch(() => {});
      failed++;
    }
  }

  return { due: due.length, ran, sent, failed };
}
