import { prisma, type Plan } from "@watool/db";
import { planLimits, type PlanLimits } from "@watool/types";

export type Usage = {
  plan: Plan;
  limits: PlanLimits;
  members: number;
  contacts: number;
  messagesThisMonth: number;
  publishedFlows: number;
};

/** First day of the current month (used as the message-quota window). */
export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Current usage for an org, alongside its plan's limits. */
export async function getUsage(orgId: string, plan: Plan): Promise<Usage> {
  const monthStart = startOfMonth();
  const [members, contacts, messagesThisMonth, publishedFlows] = await Promise.all([
    prisma.membership.count({ where: { orgId } }),
    prisma.contact.count({ where: { orgId } }),
    prisma.message.count({
      where: { orgId, direction: "OUT", createdAt: { gte: monthStart } },
    }),
    prisma.flow.count({ where: { orgId, status: "PUBLISHED" } }),
  ]);

  return {
    plan,
    limits: planLimits(plan),
    members,
    contacts,
    messagesThisMonth,
    publishedFlows,
  };
}
