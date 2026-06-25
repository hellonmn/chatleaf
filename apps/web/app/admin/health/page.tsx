import Link from "next/link";
import { MessageCircle, AlertTriangle, CheckCircle2, Clock, Smartphone } from "lucide-react";
import { WaIcon } from "@/components/WaIcon";
import { prisma, type WaAccountStatus } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card } from "@/components/ui/Card";
import { timeAgo } from "@/lib/format";

const STATUS_STYLE: Record<WaAccountStatus, string> = {
  CONNECTED: "bg-brand-soft text-brand-ink",
  ERROR: "bg-rose/10 text-rose",
  DISCONNECTED: "bg-warm/15 text-[#c47a2e]",
  PENDING: "bg-slate-100 text-slate-600",
};

const WEEK_MS = 7 * 86_400_000;

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AdminHealthPage() {
  await requirePlatformAdmin();
  const now = Date.now();

  const accounts = await prisma.whatsAppAccount.findMany({
    orderBy: { updatedAt: "desc" },
    include: { org: { select: { id: true, name: true } }, phoneNumbers: true },
  });

  const rows = accounts.map((a) => {
    const exp = a.tokenExpiresAt ? a.tokenExpiresAt.getTime() : null;
    const expired = exp !== null && exp < now;
    const expiringSoon = exp !== null && !expired && exp - now < WEEK_MS;
    const needsAttention =
      a.status === "ERROR" || a.status === "DISCONNECTED" || expired;
    return { a, expired, expiringSoon, needsAttention };
  });

  const attention = rows.filter((r) => r.needsAttention);
  const healthy = rows.filter((r) => !r.needsAttention);

  const summary = [
    { label: "Connected", value: rows.filter((r) => r.a.status === "CONNECTED" && !r.expired).length, icon: CheckCircle2, tone: "text-brand" },
    { label: "Need attention", value: attention.length, icon: AlertTriangle, tone: "text-rose" },
    { label: "Token expiring", value: rows.filter((r) => r.expiringSoon).length, icon: Clock, tone: "text-[#c47a2e]" },
    { label: "Total accounts", value: rows.length, icon: MessageCircle, tone: "text-sub" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">WhatsApp health</h2>
        <p className="mt-0.5 text-sm text-sub">
          Connection status of every org&apos;s WhatsApp account. Expired tokens (Meta
          code 190) stop all sends — chase these first.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-sub">{s.label}</span>
                <Icon className={`h-4 w-4 ${s.tone}`} />
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</div>
            </Card>
          );
        })}
      </div>

      {attention.length > 0 && (
        <Section title="Needs attention" rows={attention} />
      )}
      <Section
        title={attention.length > 0 ? "Healthy" : "All accounts"}
        rows={healthy}
        emptyText="No healthy accounts."
      />
    </div>
  );
}

function Section({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: {
    a: {
      id: string;
      wabaId: string;
      status: WaAccountStatus;
      tokenExpiresAt: Date | null;
      updatedAt: Date;
      org: { id: string; name: string };
      phoneNumbers: { id: string; displayNumber: string; verifiedName: string | null }[];
    };
    expired: boolean;
    expiringSoon: boolean;
  }[];
  emptyText?: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">{title}</h3>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-faint">{emptyText ?? "Nothing here."}</div>
        ) : (
          <div className="divide-y divide-line">
            {rows.map(({ a, expired, expiringSoon }) => {
              const phone = a.phoneNumbers[0];
              return (
                <Link
                  key={a.id}
                  href={`/admin/orgs/${a.org.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white">
                    <WaIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{a.org.name}</div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-faint">
                      <Smartphone className="h-3 w-3" />
                      {phone ? `${phone.displayNumber}${phone.verifiedName ? ` · ${phone.verifiedName}` : ""}` : `WABA ${a.wabaId} · no number`}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs sm:block">
                    {expired ? (
                      <span className="font-semibold text-rose">token expired</span>
                    ) : expiringSoon && a.tokenExpiresAt ? (
                      <span className="font-semibold text-[#c47a2e]">expires {fmtDate(a.tokenExpiresAt)}</span>
                    ) : a.tokenExpiresAt ? (
                      <span className="text-faint">expires {fmtDate(a.tokenExpiresAt)}</span>
                    ) : (
                      <span className="text-faint">no token expiry</span>
                    )}
                    <div className="text-faint">updated {timeAgo(a.updatedAt)}</div>
                  </div>
                  <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>
                    {expired ? "EXPIRED" : a.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
