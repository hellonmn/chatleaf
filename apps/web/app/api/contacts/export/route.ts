import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download all contacts for the active org as a CSV. */
export async function GET() {
  const ctx = await requireActiveContext();

  const contacts = await prisma.contact.findMany({
    where: { orgId: ctx.orgId },
    include: { contactTags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
    take: 50000,
  });

  const header = ["name", "phone", "waId", "stage", "source", "value", "tags", "lastInboundAt"];
  const rows = [
    header,
    ...contacts.map((c) => [
      c.name ?? "",
      c.phone ?? "",
      c.waId,
      c.stage,
      c.source ?? "",
      c.value ?? "",
      c.contactTags.map((t) => t.tag.name).join("; "),
      c.lastInboundAt ? c.lastInboundAt.toISOString() : "",
    ]),
  ];

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
      "Cache-Control": "no-store",
    },
  });
}
