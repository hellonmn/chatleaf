import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { createBroadcastAction } from "@/lib/actions/broadcasts";

const field =
  "mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default async function NewBroadcastPage() {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return <div className="text-sm text-sub">Only owners and admins can create broadcasts.</div>;
  }

  const [approved, tags, optedInCount] = await Promise.all([
    prisma.template.findMany({ where: { orgId: ctx.orgId, metaStatus: "APPROVED" }, orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.contact.count({ where: { orgId: ctx.orgId, optInStatus: "OPTED_IN" } }),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/dashboard/broadcasts" className="mb-4 inline-flex items-center gap-1 text-sm text-sub hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Broadcasts
      </Link>
      <div className="rounded-card border border-line bg-white p-6 shadow-card">
        <h1 className="text-lg font-bold text-ink">New broadcast</h1>
        <p className="mt-0.5 text-sm text-sub">Send an approved template to a segment of opted-in contacts.</p>

        {approved.length === 0 ? (
          <p className="mt-4 rounded-btn bg-warm/15 px-3 py-2 text-sm text-[#c47a2e]">
            You need at least one <strong>approved</strong> template.{" "}
            <Link href="/dashboard/templates" className="underline">Sync from Meta</Link> first.
          </p>
        ) : (
          <form action={createBroadcastAction} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-ink">Template</label>
              <select name="templateId" className={field}>
                {approved.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Audience</label>
              <select name="tag" className={field}>
                <option value="">All opted-in contacts ({optedInCount})</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>Tagged “{t.name}”</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-faint">Only opted-in contacts receive broadcasts (Meta policy).</p>
            </div>
            <input type="hidden" name="optedInOnly" value="true" />
            <button className="w-full rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark">
              Create broadcast
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
