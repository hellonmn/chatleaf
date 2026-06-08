import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Prisma client singleton. Next.js dev hot-reloads modules, which would
 * otherwise open a new pool on every reload and exhaust connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { orgScoped } from "./org-scoped";
