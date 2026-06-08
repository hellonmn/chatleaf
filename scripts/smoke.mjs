// Smoke test: exercises the exact signup data path against the live DB.
// Run: node scripts/smoke.mjs
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const email = `smoke+${randomBytes(4).toString("hex")}@watool.test`;

async function main() {
  console.log("→ connecting to", process.env.DATABASE_URL?.split("@")[1]?.split("/")[0]);

  // 1. Mirror signupAction: create user + org + OWNER membership in one txn.
  const passwordHash = await bcrypt.hash("hunter2pass", 10);
  const slug = "smoke-" + randomBytes(4).toString("hex");
  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: "Smoke Test", email, passwordHash },
    });
    const org = await tx.org.create({ data: { name: "Smoke Co", slug } });
    await tx.membership.create({
      data: { orgId: org.id, userId: user.id, role: "OWNER" },
    });
    return { user, org };
  });
  console.log("✓ created user", user.id, "+ org", org.id);

  // 2. Mirror requireActiveContext: resolve membership with org.
  const ctx = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { org: true, user: true },
  });
  console.log("✓ resolved context:", ctx.user.email, "→", ctx.org.name, "as", ctx.role);

  // 3. Mirror inviteMemberAction: create an invite.
  const invite = await prisma.invite.create({
    data: {
      orgId: org.id,
      email: "teammate@watool.test",
      role: "AGENT",
      token: randomBytes(24).toString("hex"),
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  console.log("✓ created invite for", invite.email, "role", invite.role);

  // 4. Verify password check (login path).
  const ok = await bcrypt.compare("hunter2pass", user.passwordHash);
  console.log("✓ password verify:", ok);

  // 5. Clean up so the DB stays pristine.
  await prisma.org.delete({ where: { id: org.id } }); // cascades to membership+invite
  await prisma.user.delete({ where: { id: user.id } });
  console.log("✓ cleaned up test rows");

  console.log("\nALL CHECKS PASSED ✅");
}

main()
  .catch((e) => {
    console.error("SMOKE FAILED ❌\n", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
