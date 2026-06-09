import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { AutoRefresh } from "@/components/AutoRefresh";
import { deleteBroadcastAction } from "@/lib/actions/broadcasts";
import { SendButton } from "./SendButton";

const RECIPIENT_STYLE: Record<string, string> = {
  read: "text-emerald-700",
  delivered: "text-sky-700",
  sent: "text-slate-600",
  failed: "text-red-600",
  pending: "text-slate-400",
};

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireActiveContext();
  const { id } = await params;

  const b = await prisma.broadcast.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      template: true,
      segment: true,
      recipients: { include: { contact: true }, orderBy: { createdAt: "asc" }, take: 500 },
    },
  });
  if (!b) notFound();

  const manage = canManageOrg(ctx.role);
  const filter = (b.segment?.filterJSON as { tag?: string; optedInOnly?: boolean }) ?? {};
  const counts = b.recipients.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const running = b.status === "RUNNING";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {running && <AutoRefresh seconds={3} />}

      <div className="flex items-center gap-2">
        <Link href="/dashboard/broadcasts" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">{b.template.name}</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {b.status.toLowerCase()}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Template</div>
          <div className="text-slate-900">{b.template.name}</div>
          <div className="text-xs text-slate-400">{b.template.language}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Audience</div>
          <div className="text-slate-900">{filter.tag ? `tag: ${filter.tag}` : "all opted-in"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Recipients</div>
          <div className="text-slate-900">{b.recipients.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Sent</div>
          <div className="text-slate-900">
            {(counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0)}
          </div>
        </div>
      </section>

      {/* Delivery funnel */}
      {b.recipients.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Delivery</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {["sent", "delivered", "read", "failed", "pending"].map((s) => (
              <div key={s}>
                <span className={`font-semibold ${RECIPIENT_STYLE[s]}`}>{counts[s] ?? 0}</span>{" "}
                <span className="text-slate-500">{s}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      {manage && (b.status === "DRAFT" || b.status === "SCHEDULED" || b.status === "FAILED") && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Send this broadcast</h2>
          <p className="mb-3 text-xs text-slate-500">
            Goes to opted-in contacts{filter.tag ? ` tagged "${filter.tag}"` : ""} using
            the <strong>{b.template.name}</strong> template.
          </p>
          <SendButton broadcastId={b.id} />
        </section>
      )}

      {/* Recipients */}
      {b.recipients.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {b.recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm last:border-0">
              <span className="text-slate-700">{r.contact.name ?? r.contact.waId}</span>
              <span className={`text-xs font-medium ${RECIPIENT_STYLE[r.status] ?? "text-slate-400"}`}>
                {r.status}
              </span>
            </div>
          ))}
        </section>
      )}

      {manage && (
        <form action={deleteBroadcastAction} className="pt-2">
          <input type="hidden" name="broadcastId" value={b.id} />
          <button className="text-xs font-medium text-rose hover:underline">Delete broadcast</button>
        </form>
      )}
    </div>
  );
}
