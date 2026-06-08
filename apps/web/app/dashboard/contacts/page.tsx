import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { timeAgo } from "@/lib/format";

const OPTIN_STYLE: Record<string, string> = {
  OPTED_IN: "bg-emerald-100 text-emerald-700",
  OPTED_OUT: "bg-red-100 text-red-700",
  UNKNOWN: "bg-slate-100 text-slate-500",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireActiveContext();
  const { q } = await searchParams;

  const contacts = await prisma.contact.findMany({
    where: {
      orgId: ctx.orgId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { waId: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: { contactTags: { include: { tag: true } } },
    orderBy: { lastInboundAt: { sort: "desc", nulls: "last" } },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
        <form className="w-64">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or number…"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </form>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {q ? "No contacts match your search." : "No contacts yet. They're created automatically when someone messages your number."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {contacts.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/contacts/${c.id}`}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-ink">
                {(c.name ?? c.waId).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {c.name ?? c.phone ?? c.waId}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">{c.waId}</span>
                  {c.contactTags.slice(0, 4).map((ct) => (
                    <span
                      key={ct.tagId}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                    >
                      {ct.tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  OPTIN_STYLE[c.optInStatus] ?? OPTIN_STYLE.UNKNOWN
                }`}
              >
                {c.optInStatus.replace("_", " ").toLowerCase()}
              </span>
              <span className="ml-2 shrink-0 text-xs text-slate-400">
                {c.lastInboundAt ? timeAgo(c.lastInboundAt) : "—"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
