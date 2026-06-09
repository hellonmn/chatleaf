/**
 * Verifies plan-limit enforcement logic (the same counts + ceilings the server
 * actions use): seats, published flows, monthly message quota. Cleans up.
 * Run: npm run verify-limits -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import { planLimits } from "@watool/types";

const rnd = () => Math.floor(performance.now()).toString(36) + Math.floor(performance.now() * 19).toString(36);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

async function main() {
  const free = planLimits("FREE");
  assert(free.seats === 2 && free.publishedFlows === 1 && free.messagesPerMonth === 1000, "FREE limits as configured");

  const org = await prisma.org.create({ data: { name: "Limit Test", slug: "lim-" + rnd(), plan: "FREE" } });
  const u1 = await prisma.user.create({ data: { email: `o+${rnd()}@t.test` } });
  const u2 = await prisma.user.create({ data: { email: `a+${rnd()}@t.test` } });

  try {
    // Seats: 1 member → invite allowed; 2 members → blocked.
    await prisma.membership.create({ data: { orgId: org.id, userId: u1.id, role: "OWNER" } });
    let members = await prisma.membership.count({ where: { orgId: org.id } });
    let invites = await prisma.invite.count({ where: { orgId: org.id, acceptedAt: null } });
    assert(members + invites < free.seats, "1 seat used → invite allowed");
    await prisma.membership.create({ data: { orgId: org.id, userId: u2.id, role: "AGENT" } });
    members = await prisma.membership.count({ where: { orgId: org.id } });
    assert(members + invites >= free.seats, "2 seats used → further invite blocked");

    // Published flows: 1 published → next publish blocked on FREE.
    let published = await prisma.flow.count({ where: { orgId: org.id, status: "PUBLISHED" } });
    assert(published < free.publishedFlows, "0 published → publish allowed");
    await prisma.flow.create({ data: { orgId: org.id, name: "f1", status: "PUBLISHED" } });
    published = await prisma.flow.count({ where: { orgId: org.id, status: "PUBLISHED" } });
    assert(published >= free.publishedFlows, "1 published → next publish blocked");

    // Message quota: used-this-month + audience vs ceiling.
    const usedThisMonth = await prisma.message.count({
      where: { orgId: org.id, direction: "OUT", createdAt: { gte: monthStart() } },
    });
    assert(usedThisMonth === 0, "0 messages used this month");
    assert(usedThisMonth + 1001 > free.messagesPerMonth, "audience of 1001 would exceed quota → blocked");
    assert(usedThisMonth + 500 <= free.messagesPerMonth, "audience of 500 fits quota → allowed");

    // PRO lifts the ceilings.
    const pro = planLimits("PRO");
    assert(pro.seats > free.seats && pro.messagesPerMonth > free.messagesPerMonth, "PRO raises the limits");

    console.log("\nPLAN LIMITS VERIFIED ✅");
  } finally {
    await prisma.org.delete({ where: { id: org.id } });
    await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });
    console.log("✓ cleaned up");
  }
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
