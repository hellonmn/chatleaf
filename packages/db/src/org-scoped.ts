import { prisma } from "./index";

/**
 * Tenant-isolation guard. Every tenant-owned model carries an `orgId`. Forgetting
 * to filter by it is the classic multi-tenant data leak. This helper returns a
 * thin, per-request facade whose `where`/`data` are pre-stamped with the org id,
 * so callers physically cannot query another tenant's rows.
 *
 * Usage:
 *   const db = orgScoped(session.orgId);
 *   const contacts = await db.contact.findMany();          // auto-filtered
 *   await db.contact.create({ data: { waId, name } });     // orgId injected
 *
 * Note: this covers the common single-model reads/writes used across the app.
 * For raw queries or cross-tenant admin tasks, use `prisma` directly and scope
 * by hand. A future hardening step is Postgres row-level security.
 */
export function orgScoped(orgId: string) {
  const scoped = <
    Model extends {
      findMany: (args?: any) => any;
      findFirst: (args?: any) => any;
      count: (args?: any) => any;
      create: (args: any) => any;
      createMany: (args: any) => any;
      updateMany: (args: any) => any;
      deleteMany: (args: any) => any;
    },
  >(
    model: Model,
  ) => ({
    findMany: (args: any = {}) =>
      model.findMany({ ...args, where: { ...args.where, orgId } }),
    findFirst: (args: any = {}) =>
      model.findFirst({ ...args, where: { ...args.where, orgId } }),
    count: (args: any = {}) =>
      model.count({ ...args, where: { ...args.where, orgId } }),
    create: (args: any) =>
      model.create({ ...args, data: { ...args.data, orgId } }),
    createMany: (args: any) =>
      model.createMany({
        ...args,
        data: (Array.isArray(args.data) ? args.data : [args.data]).map(
          (d: any) => ({ ...d, orgId }),
        ),
      }),
    updateMany: (args: any) =>
      model.updateMany({ ...args, where: { ...args.where, orgId } }),
    deleteMany: (args: any) =>
      model.deleteMany({ ...args, where: { ...args.where, orgId } }),
  });

  return {
    orgId,
    contact: scoped(prisma.contact),
    tag: scoped(prisma.tag),
    segment: scoped(prisma.segment),
    conversation: scoped(prisma.conversation),
    message: scoped(prisma.message),
    template: scoped(prisma.template),
    flow: scoped(prisma.flow),
    flowRun: scoped(prisma.flowRun),
    broadcast: scoped(prisma.broadcast),
    whatsAppAccount: scoped(prisma.whatsAppAccount),
  };
}
