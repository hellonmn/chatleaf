import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { SyncButton } from "./SyncButton";

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  DRAFT: "bg-slate-100 text-slate-500",
};

type Component = { type?: string; text?: string; format?: string };

function bodyText(components: unknown): string {
  const list = Array.isArray(components) ? (components as Component[]) : [];
  const body = list.find((c) => c.type?.toUpperCase() === "BODY");
  return body?.text ?? "—";
}

export default async function TemplatesPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const [templates, account] = await Promise.all([
    prisma.template.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ name: "asc" }, { language: "asc" }],
    }),
    prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Message templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Templates are created and approved in Meta, then used for
            business-initiated messages and broadcasts. Sync to mirror them here.
          </p>
        </div>
        {manage && account && <SyncButton />}
      </div>

      {!account && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect a WhatsApp number first in <strong>Settings → WhatsApp</strong>,
          then come back to sync templates.
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No templates yet.{" "}
          {account
            ? "Click “Sync from Meta” to pull your approved templates."
            : "Connect WhatsApp to get started."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-1">Lang</div>
            <div className="col-span-3">Body</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {templates.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-12 items-center border-b border-slate-100 px-4 py-3 text-sm last:border-0"
            >
              <div className="col-span-4 truncate font-medium text-slate-900">
                {t.name}
              </div>
              <div className="col-span-2 text-slate-500">
                {t.category.toLowerCase()}
              </div>
              <div className="col-span-1 text-slate-500">{t.language}</div>
              <div className="col-span-3 truncate text-slate-500" title={bodyText(t.components)}>
                {bodyText(t.components)}
              </div>
              <div className="col-span-2 text-right">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[t.metaStatus] ?? STATUS_STYLE.DRAFT
                  }`}
                >
                  {t.metaStatus.toLowerCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
