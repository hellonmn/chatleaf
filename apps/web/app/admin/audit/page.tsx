import Link from "next/link";
import { Building2, User as UserIcon } from "lucide-react";
import { prisma } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card } from "@/components/ui/Card";
import { timeAgo } from "@/lib/format";
import { actionMeta, summarizeMetadata } from "@/lib/audit-format";

export default async function AdminAuditPage() {
  await requirePlatformAdmin();

  const entries = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Audit log</h2>
        <p className="mt-0.5 text-sm text-sub">
          Every platform-admin action, newest first. Append-only.
        </p>
      </div>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">
            No admin actions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {entries.map((e) => {
              const meta = actionMeta(e.action);
              const summary = summarizeMetadata(e.action, e.metadata);
              const isOrg = e.targetType === "org";
              const linkable = isOrg && e.action !== "org.delete";
              const TargetIcon = isOrg ? Building2 : UserIcon;
              const label = e.targetLabel ?? e.targetId;
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                      <TargetIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                      {linkable ? (
                        <Link
                          href={`/admin/orgs/${e.targetId}`}
                          className="font-semibold text-ink hover:text-brand"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink">{label}</span>
                      )}
                      {summary && <span className="text-sub">· {summary}</span>}
                    </div>
                    <div className="truncate text-xs text-faint">by {e.actorEmail}</div>
                  </div>
                  <span className="shrink-0 text-xs text-faint" title={e.createdAt.toISOString()}>
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {entries.length === 150 && (
        <p className="text-center text-xs text-faint">Showing the 150 most recent entries.</p>
      )}
    </div>
  );
}
