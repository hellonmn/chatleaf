import Link from "next/link";
import { Plus, Megaphone, Search } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import { Card } from "@/components/ui/Card";

const STAGES = ["NEW", "QUALIFIED", "ENGAGED", "CONVERTED"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_META: Record<Stage, { label: string; dot: string; bar: string; pill: string }> = {
  NEW: { label: "New", dot: "#97a1b0", bar: "bg-faint", pill: "bg-canvas text-sub" },
  QUALIFIED: { label: "Qualified", dot: "#56a8d8", bar: "bg-sky", pill: "bg-[#e6f1fb] text-[#3179a8]" },
  ENGAGED: { label: "Engaged", dot: "#f3a05a", bar: "bg-warm", pill: "bg-warm/15 text-[#c47a2e]" },
  CONVERTED: { label: "Converted", dot: "#0e7490", bar: "bg-brand", pill: "bg-brand-soft text-brand-ink" },
};

function money(v: number | null): string {
  if (v == null) return "—";
  return "₹" + v.toLocaleString("en-IN");
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const ctx = await requireActiveContext();
  const { stage, q } = await searchParams;
  const activeStage = STAGES.includes(stage as Stage) ? (stage as Stage) : null;

  const where = {
    orgId: ctx.orgId,
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

  const [grouped, total, contacts] = await Promise.all([
    prisma.contact.groupBy({ by: ["stage"], where: { orgId: ctx.orgId }, _count: true }),
    prisma.contact.count({ where: { orgId: ctx.orgId } }),
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
  ]);

  const counts: Record<Stage, number> = { NEW: 0, QUALIFIED: 0, ENGAGED: 0, CONVERTED: 0 };
  for (const g of grouped) counts[g.stage as Stage] = g._count;
  const maxCount = Math.max(1, ...STAGES.map((s) => counts[s]));

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
          <div className="flex flex-wrap gap-1.5">
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
            <Link href="/dashboard/broadcasts" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
              <Megaphone className="h-4 w-4" /> Broadcast
            </Link>
            <Link href="/dashboard/contacts/new" className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark">
              <Plus className="h-4 w-4" /> Add contact
            </Link>
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-faint">No contacts here yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                  <th className="px-5 py-2.5 font-semibold">Contact</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  <th className="px-3 py-2.5 font-semibold">Tags</th>
                  <th className="px-3 py-2.5 font-semibold">Source</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Est. value</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const name = c.name ?? c.phone ?? c.waId;
                  const owner = c.conversations[0]?.assignedUser;
                  const m = STAGE_META[c.stage as Stage];
                  return (
                    <tr key={c.id} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/contacts/${c.id}`} className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand-ink">
                            {name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">{name}</span>
                            <span className="block truncate text-xs text-faint">{c.phone ?? "+" + c.waId}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs font-semibold ${m.pill}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
                          {m.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.contactTags.length === 0 && <span className="text-faint">—</span>}
                          {c.contactTags.map((ct) => (
                            <span key={ct.tagId} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-sub">
                              {ct.tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sub">{c.source ?? "—"}</td>
                      <td className="px-3 py-3">
                        {owner ? (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-violet/15 text-[11px] font-bold text-violet" title={owner.name ?? owner.email}>
                            {(owner.name ?? owner.email).slice(0, 2).toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{money(c.value)}</td>
                      <td className="px-5 py-3 text-right text-faint">{c.lastInboundAt ? timeAgo(c.lastInboundAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
