import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { prisma, Prisma } from "@watool/db";
import { PLANS } from "@watool/types";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/Pagination";
import { timeAgo } from "@/lib/format";

const PAGE_SIZE = 25;

const PLAN_STYLE: Record<string, string> = {
  FREE: "bg-slate-100 text-slate-600",
  STARTER: "bg-sky/15 text-sky",
  PRO: "bg-brand-soft text-brand-ink",
};

const field =
  "rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const plan = PLANS.includes(sp.plan as never) ? sp.plan : "";
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.OrgWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { slug: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(plan ? { plan: plan as never } : {}),
    ...(status === "suspended"
      ? { suspendedAt: { not: null } }
      : status === "active"
        ? { suspendedAt: null }
        : {}),
  };

  const [total, orgs] = await Promise.all([
    prisma.org.count({ where }),
    prisma.org.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { memberships: true, contacts: true, messages: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or slug…"
            className={`${field} w-full pl-9`}
          />
        </div>
        <select name="plan" defaultValue={plan} className={field}>
          <option value="">All plans</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={field}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Apply
        </button>
      </form>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 border-b border-line px-5 py-3 text-xs font-bold uppercase tracking-wide text-faint md:grid">
          <span>Organization</span>
          <span className="text-right">Plan</span>
          <span className="text-right">Members</span>
          <span className="text-right">Contacts</span>
          <span className="text-right">Messages</span>
          <span className="text-right">Created</span>
        </div>
        {orgs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">
            No organizations match your filters.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {orgs.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orgs/${o.id}`}
                className="grid grid-cols-1 items-center gap-2 px-5 py-3.5 hover:bg-canvas md:grid-cols-[1fr_auto_auto_auto_auto_auto] md:gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand-ink">
                    {o.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
                      {o.suspendedAt && (
                        <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
                          suspended
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-faint">/{o.slug}</div>
                  </div>
                </div>
                <span className="md:text-right">
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${PLAN_STYLE[o.plan]}`}>
                    {o.plan}
                  </span>
                </span>
                <span className="text-sm text-sub md:text-right">{o._count.memberships}</span>
                <span className="text-sm text-sub md:text-right">{o._count.contacts.toLocaleString()}</span>
                <span className="text-sm text-sub md:text-right">{o._count.messages.toLocaleString()}</span>
                <span className="flex items-center justify-end gap-1 text-xs text-faint">
                  {timeAgo(o.createdAt)}
                  <ChevronRight className="hidden h-4 w-4 md:block" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/orgs"
        params={{ q: query, plan, status }}
      />
    </div>
  );
}
