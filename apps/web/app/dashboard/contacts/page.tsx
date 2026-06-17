import Link from "next/link";
import { Plus, Megaphone, Search, Download } from "lucide-react";
import { prisma, type Prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getActiveChannelId } from "@/lib/active-channel";
import { Card } from "@/components/ui/Card";
import { ImportContacts } from "./ImportContacts";
import { ContactsTable, type Row } from "./ContactsTable";

const STAGES = ["NEW", "QUALIFIED", "ENGAGED", "CONVERTED"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_META: Record<Stage, { label: string; dot: string; bar: string; pill: string }> = {
  NEW: { label: "New", dot: "#97a1b0", bar: "bg-faint", pill: "bg-canvas text-sub" },
  QUALIFIED: { label: "Qualified", dot: "#56a8d8", bar: "bg-sky", pill: "bg-[#e6f1fb] text-[#3179a8]" },
  ENGAGED: { label: "Engaged", dot: "#f3a05a", bar: "bg-warm", pill: "bg-warm/15 text-[#c47a2e]" },
  CONVERTED: { label: "Converted", dot: "#0e7490", bar: "bg-brand", pill: "bg-brand-soft text-brand-ink" },
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const ctx = await requireActiveContext();
  const { stage, q } = await searchParams;
  const activeStage = STAGES.includes(stage as Stage) ? (stage as Stage) : null;
  const activeChannelId = await getActiveChannelId();

  // Per-channel: only contacts who've conversed on the selected number.
  const channelFilter: Prisma.ContactWhereInput = activeChannelId
    ? { conversations: { some: { phoneNumberId: activeChannelId } } }
    : {};

  const where: Prisma.ContactWhereInput = {
    orgId: ctx.orgId,
    ...channelFilter,
    ...(activeStage ? { stage: activeStage } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { waId: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [grouped, total, contacts, tagRows] = await Promise.all([
    prisma.contact.groupBy({ by: ["stage"], where: { orgId: ctx.orgId, ...channelFilter }, _count: true }),
    prisma.contact.count({ where: { orgId: ctx.orgId, ...channelFilter } }),
    prisma.contact.findMany({
      where,
      include: {
        contactTags: { include: { tag: true }, take: 3 },
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: { assignedUser: { select: { name: true, email: true } } },
        },
      },
      orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const rows: Row[] = contacts.map((c) => {
    const owner = c.conversations[0]?.assignedUser;
    return {
      id: c.id,
      name: c.name ?? c.phone ?? c.waId,
      phone: c.phone,
      waId: c.waId,
      stage: c.stage,
      tags: c.contactTags.map((ct) => ct.tag.name),
      source: c.source,
      ownerName: owner ? owner.name ?? owner.email : null,
      value: c.value,
      lastInboundAt: c.lastInboundAt ? c.lastInboundAt.toISOString() : null,
    };
  });

  const counts: Record<Stage, number> = { NEW: 0, QUALIFIED: 0, ENGAGED: 0, CONVERTED: 0 };
  for (const g of grouped) counts[g.stage as Stage] = g._count;
  const maxCount = Math.max(1, ...STAGES.map((s) => counts[s]));
  const channelLabel = activeChannelId
    ? (await prisma.phoneNumber.findUnique({ where: { id: activeChannelId }, select: { displayNumber: true } }))?.displayNumber ?? null
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Stage summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAGES.map((s) => {
          const m = STAGE_META[s];
          return (
            <Card key={s} className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-sub">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.dot }} />
                {m.label}
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{counts[s]}</div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                <div className={`h-full ${m.bar}`} style={{ width: `${Math.round((counts[s] / maxCount) * 100)}%` }} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {channelLabel && (
              <span className="mr-1 inline-flex items-center gap-1 rounded-pill bg-[#25D366]/10 px-2 py-1 text-xs font-semibold text-[#1da851]">
                {channelLabel}
              </span>
            )}
            <FilterPill href="/dashboard/contacts" active={!activeStage}>All {total}</FilterPill>
            {STAGES.map((s) => (
              <FilterPill key={s} href={`/dashboard/contacts?stage=${s}`} active={activeStage === s}>
                {STAGE_META[s].label} {counts[s]}
              </FilterPill>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <form className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search…"
                className="w-44 rounded-btn border border-line bg-canvas py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </form>
            <a href="/api/contacts/export" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
              <Download className="h-4 w-4" /> Export
            </a>
            <ImportContacts />
            <Link href="/dashboard/broadcasts" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
              <Megaphone className="h-4 w-4" /> Broadcast
            </Link>
            <Link href="/dashboard/contacts/new" className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark">
              <Plus className="h-4 w-4" /> Add contact
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-faint">No contacts here yet.</div>
        ) : (
          <div className="px-2 pb-2">
            <ContactsTable rows={rows} tags={tagRows.map((t) => t.name)} />
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
        active ? "bg-brand text-white" : "bg-canvas text-sub hover:bg-line"
      }`}
    >
      {children}
    </Link>
  );
}
