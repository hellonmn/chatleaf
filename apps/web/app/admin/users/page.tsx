import Link from "next/link";
import { Search, ShieldCheck, ShieldOff } from "lucide-react";
import { prisma, Prisma } from "@watool/db";
import { requirePlatformAdmin, isPlatformAdminEmail } from "@/lib/platform";
import { setPlatformAdminAction } from "@/lib/actions/admin";
import { Card, SectionCard } from "@/components/ui/Card";
import { Pagination } from "@/components/Pagination";
import { timeAgo } from "@/lib/format";
import { AddAdminForm } from "./AddAdminForm";

const PAGE_SIZE = 25;

const field =
  "rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const me = await requirePlatformAdmin();
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const role = sp.role === "admins" ? "admins" : "";
  const status = sp.status === "active" || sp.status === "disabled" ? sp.status : "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.UserWhereInput = {
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(role === "admins" ? { isPlatformAdmin: true } : {}),
    ...(status === "disabled"
      ? { disabledAt: { not: null } }
      : status === "active"
        ? { disabledAt: null }
        : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { memberships: true } } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SectionCard title="Add a platform admin">
        <p className="mb-3 -mt-1 text-sm text-sub">
          Grant cross-org admin access to an existing account by email. They must
          have signed up already. You can also toggle access per user in the list
          below.
        </p>
        <AddAdminForm />
      </SectionCard>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or email…"
            className={`${field} w-full pl-9`}
          />
        </div>
        <select name="role" defaultValue={role} className={field}>
          <option value="">All users</option>
          <option value="admins">Platform admins</option>
        </select>
        <select name="status" defaultValue={status} className={field}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Deactivated</option>
        </select>
        <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Apply
        </button>
      </form>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">
            No users match your filters.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {users.map((u) => {
              const envAdmin = isPlatformAdminEmail(u.email);
              const isAdmin = u.isPlatformAdmin || envAdmin;
              const isSelf = u.id === me.userId;
              const disabled = !!u.disabledAt;
              return (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Link href={`/admin/users/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand-ink">
                      {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {u.name ?? u.email}
                        </span>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">
                            <ShieldCheck className="h-3 w-3" /> platform admin
                          </span>
                        )}
                        {disabled && (
                          <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
                            deactivated
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-faint">
                        {u.email} · {u._count.memberships} org(s) · joined {timeAgo(u.createdAt)}
                      </div>
                    </div>
                  </Link>

                  {envAdmin ? (
                    <span className="text-xs text-faint" title="Granted via PLATFORM_ADMIN_EMAILS">
                      via env
                    </span>
                  ) : (
                    <form action={setPlatformAdminAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="value" value={u.isPlatformAdmin ? "false" : "true"} />
                      {u.isPlatformAdmin ? (
                        <button
                          disabled={isSelf}
                          title={isSelf ? "You can't revoke your own access" : undefined}
                          className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldOff className="h-4 w-4" /> Revoke admin
                        </button>
                      ) : (
                        <button className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink/90">
                          <ShieldCheck className="h-4 w-4" /> Make admin
                        </button>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/users"
        params={{ q: query, role, status }}
      />
    </div>
  );
}
