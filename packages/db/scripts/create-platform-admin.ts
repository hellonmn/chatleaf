/**
 * Create (or update) a platform-admin login.
 *
 *   npx tsx packages/db/scripts/create-platform-admin.ts [email] [password]
 *
 * Defaults are provided for quick local bootstrap. Idempotent: re-running with
 * the same email just resets the password and re-asserts platform-admin rights.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@watool/db";

async function main() {
  const email = (process.argv[2] ?? "admin@chatleaf.app").toLowerCase();
  const password = process.argv[3] ?? "Chatleaf@2026";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Platform Admin", passwordHash, isPlatformAdmin: true },
    update: { passwordHash, isPlatformAdmin: true },
  });

  console.log("\n✅ Platform admin ready");
  console.log("   email:    ", user.email);
  console.log("   password: ", password);
  console.log("   userId:   ", user.id);
  console.log("\nLog in at /login, then open /admin.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Failed to create platform admin:", e);
    process.exit(1);
  });
