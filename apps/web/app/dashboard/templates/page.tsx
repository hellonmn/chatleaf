import Link from "next/link";
import { Plus, Copy, Pencil, Search } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { canManageOrg } from "@watool/types";
import { timeAgo } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { SyncButton } from "./SyncButton";
import { FeatureDisabled } from "@/components/FeatureDisabled";

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-warm/15 text-[#c47a2e]",
  REJECTED: "bg-rose/10 text-rose",
  DRAFT: "bg-canvas text-faint",
};
const CAT_PILL: Record<string, string> = {
  MARKETING: "bg-[#efeafb] text-violet",
  UTILITY: "bg-[#e6f1fb] text-[#3179a8]",
  AUTHENTICATION: "bg-brand-soft text-brand-ink",
};

const CATS = [
  { key: "all", label: "All" },
  { key: "MARKETING", label: "Marketing" },
  { key: "UTILITY", label: "Utility" },
] as const;

type Component = { type?: string; text?: string };
function bodyText(components: unknown): string {
  const list = Array.isArray(components) ? (components as Component[]) : [];
  return list.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? "—";
}

/** Render template body, highlighting {{n}} placeholders. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{\d+\}\}$/.test(p) ? (
          <span key={i} className="font-semibold text-brand">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const ctx = await requireActiveContext();
  if (!(await getPlatformSettings()).templatesEnabled) return <FeatureDisabled name="Message templates" />;
  const manage = canManageOrg(ctx.role);
  const { category } = await searchParams;
  const active = category && category !== "all" ? category : "all";

  const [templates, account] = await Promise.all([
    prisma.template.findMany({
      where: { orgId: ctx.orgId, ...(active !== "all" ? { category: active } : {}) },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <Link
              key={c.key}
              href={c.key === "all" ? "/dashboard/templates" : `/dashboard/templates?category=${c.key}`}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
                active === c.key ? "bg-brand text-white" : "bg-canvas text-sub hover:bg-line"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
        {manage && (
          <div className="flex items-center gap-2">
            {account && <SyncButton />}
            <Link href="/dashboard/templates/new" className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark">
              <Plus className="h-4 w-4" /> New template
            </Link>
          </div>
        )}
      </div>

      {!account && (
        <div className="rounded-card bg-warm/15 px-4 py-3 text-sm text-[#c47a2e]">
          Connect a WhatsApp number in <Link href="/dashboard/settings/whatsapp" className="font-semibold underline">Channels</Link> to sync your templates.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate font-bold text-ink">{t.name}</span>
              <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[t.metaStatus] ?? STATUS_BADGE.DRAFT}`}>
                {t.metaStatus.toLowerCase()}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${CAT_PILL[t.category] ?? "bg-canvas text-sub"}`}>
                {t.category.toLowerCase()}
              </span>
              <span className="rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-semibold text-sub uppercase">
                {t.language.split("_")[0]}
              </span>
            </div>
            {/* message preview bubble */}
            <div className="mt-3 flex-1 rounded-xl bg-canvas p-3">
              <div className="rounded-lg rounded-tl-sm bg-white p-2.5 text-xs leading-relaxed text-ink shadow-sm">
                <Body text={bodyText(t.components)} />
                <div className="mt-1 text-right text-[10px] text-faint">10:24 ✓✓</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-faint">
              <span>Updated {timeAgo(t.updatedAt)}</span>
              <div className="flex items-center gap-2 text-sub">
                <Copy className="h-3.5 w-3.5" />
                <Pencil className="h-3.5 w-3.5" />
              </div>
            </div>
          </Card>
        ))}

        {/* Create-in-app card → submits to Meta */}
        {manage && (
          <Link
            href="/dashboard/templates/new"
            className="flex min-h-[220px] flex-col items-center justify-center rounded-card border-2 border-dashed border-line p-4 text-center transition-colors hover:border-brand hover:bg-brand-soft/40"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
              <Plus className="h-6 w-6" />
            </span>
            <div className="mt-2 text-sm font-bold text-ink">Create new template</div>
            <div className="mt-0.5 text-xs text-sub">Build it here & submit to Meta for review</div>
          </Link>
        )}
      </div>

      {templates.length === 0 && account && (
        <div className="rounded-card border border-dashed border-line bg-white p-10 text-center text-sm text-faint">
          No templates yet — click <strong>Sync from Meta</strong> to pull your approved templates.
        </div>
      )}
    </div>
  );
}
