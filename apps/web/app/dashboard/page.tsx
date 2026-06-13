import Link from "next/link";
import {
  Send,
  CheckCheck,
  UserPlus,
  MessagesSquare,
  TrendingUp,
  TrendingDown,
  CircleDot,
} from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import { Card, SectionCard } from "@/components/ui/Card";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";

// ── date helpers ────────────────────────────────────────────────────────────
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function snippet(m: { type: string; payload: unknown } | undefined): string {
  if (!m) return "No messages yet";
  const p = m.payload as { text?: { body?: string } } | null;
  return p?.text?.body ?? `[${m.type}]`;
}

export default async function DashboardOverview() {
  const ctx = await requireActiveContext();
  const orgId = ctx.orgId;

  const now = new Date();
  const weekStart = addDays(startOfDay(now), -6); // last 7 days incl. today
  const prevWeekStart = addDays(weekStart, -7);
  const sevenAgo = weekStart;

  const [
    msgSentWeek,
    msgSentPrev,
    deliveredWeek,
    sentWeekAll,
    leadsWeek,
    leadsPrev,
    openChats,
    recent,
    weekMessages,
    stageGroups,
    totalContacts,
    latestBroadcast,
    waAccount,
  ] = await Promise.all([
    prisma.message.count({ where: { orgId, direction: "OUT", createdAt: { gte: weekStart } } }),
    prisma.message.count({ where: { orgId, direction: "OUT", createdAt: { gte: prevWeekStart, lt: weekStart } } }),
    prisma.message.count({ where: { orgId, direction: "OUT", status: { in: ["DELIVERED", "READ"] }, createdAt: { gte: weekStart } } }),
    prisma.message.count({ where: { orgId, direction: "OUT", status: { in: ["SENT", "DELIVERED", "READ", "FAILED"] }, createdAt: { gte: weekStart } } }),
    prisma.contact.count({ where: { orgId, createdAt: { gte: weekStart } } }),
    prisma.contact.count({ where: { orgId, createdAt: { gte: prevWeekStart, lt: weekStart } } }),
    prisma.conversation.count({ where: { orgId, status: { in: ["BOT", "AGENT", "OPEN"] } } }),
    prisma.conversation.findMany({
      where: { orgId },
      include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
    prisma.message.findMany({ where: { orgId, createdAt: { gte: sevenAgo } }, select: { createdAt: true } }),
    prisma.contact.groupBy({ by: ["stage"], where: { orgId }, _count: true }),
    prisma.contact.count({ where: { orgId } }),
    prisma.broadcast.findFirst({ where: { orgId }, include: { template: true }, orderBy: { createdAt: "desc" } }),
    prisma.whatsAppAccount.findFirst({ where: { orgId } }),
  ]);

  const deliveryRate = sentWeekAll ? Math.round((deliveredWeek / sentWeekAll) * 1000) / 10 : 0;

  // bucket messages into the last 7 days
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    return { label: DAY_LABELS[day.getDay()]!, value: 0 };
  });
  for (const m of weekMessages) {
    const idx = Math.floor((startOfDay(m.createdAt).getTime() - weekStart.getTime()) / 86_400_000);
    if (idx >= 0 && idx < 7) buckets[idx]!.value += 1;
  }
  const maxBar = Math.max(1, ...buckets.map((b) => b.value));
  const busiest = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0]!);

  const bStats = (latestBroadcast?.stats as { sent?: number; total?: number }) ?? {};
  const stageCount = { NEW: 0, QUALIFIED: 0, ENGAGED: 0, CONVERTED: 0 };
  for (const g of stageGroups) stageCount[g.stage as keyof typeof stageCount] = g._count;
  const conversion = totalContacts ? Math.round((stageCount.CONVERTED / totalContacts) * 100) : 0;

  const stats = [
    { label: "Messages sent", value: msgSentWeek.toLocaleString(), delta: pctDelta(msgSentWeek, msgSentPrev), icon: Send },
    { label: "Delivery rate", value: `${deliveryRate}%`, delta: null, icon: CheckCheck },
    { label: "New leads", value: leadsWeek.toLocaleString(), delta: pctDelta(leadsWeek, leadsPrev), icon: UserPlus },
    { label: "Open chats", value: openChats.toLocaleString(), delta: null, icon: MessagesSquare },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* First-run setup checklist (owners/admins; hides when done/dismissed) */}
      <OnboardingChecklist orgId={orgId} role={ctx.role} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const up = (s.delta ?? 0) >= 0;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-sub">{s.label}</span>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</div>
              {s.delta !== null && (
                <span
                  className={`mt-3 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold ${
                    up ? "bg-emerald-50 text-emerald-700" : "bg-rose/10 text-rose"
                  }`}
                >
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {up ? "+" : ""}
                  {s.delta}% vs last wk
                </span>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Recent conversations" action={{ label: "Open inbox", href: "/dashboard/inbox" }} bodyClassName="px-2 pb-2">
            {recent.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-faint">No conversations yet.</div>
            ) : (
              recent.map((c) => {
                const name = c.contact.name ?? c.contact.phone ?? c.contact.waId;
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/inbox/${c.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand-ink">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-semibold text-ink">{name}</span>
                        <span className="text-xs text-faint">{timeAgo(c.lastMessageAt)}</span>
                      </div>
                      <div className="truncate text-sm text-sub">{snippet(c.messages[0])}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Messages this week">
            <div className="mb-3 -mt-2 text-sm text-sub">
              {busiest.value > 0 ? `${dayName(busiest.label)} was your busiest day` : "No messages yet this week"}
            </div>
            <div className="flex h-40 items-end justify-between gap-3">
              {buckets.map((b, i) => {
                const h = Math.round((b.value / maxBar) * 100);
                const isMax = b.value === maxBar && b.value > 0;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-lg ${isMax ? "bg-brand" : "bg-brand-soft"}`}
                        style={{ height: `${Math.max(h, 5)}%` }}
                      />
                    </div>
                    <span className="text-xs text-faint">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-5">
          <SectionCard title="Conversion">
            <div className="flex items-center gap-5">
              <Donut percent={conversion} />
              <div className="space-y-2 text-sm">
                <Legend color="#97a1b0" label="New" value={stageCount.NEW} />
                <Legend color="#56a8d8" label="Qualified" value={stageCount.QUALIFIED} />
                <Legend color="#f3a05a" label="Engaged" value={stageCount.ENGAGED} />
                <Legend color="#0e7490" label="Converted" value={stageCount.CONVERTED} />
              </div>
            </div>
          </SectionCard>

          {latestBroadcast && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 text-brand" />
                <span className="font-bold text-ink">{latestBroadcast.template.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-sub">{latestBroadcast.status.toLowerCase()} broadcast</div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Mini label="Recipients" value={(bStats.total ?? 0).toLocaleString()} />
                <Mini label="Sent" value={(bStats.sent ?? 0).toLocaleString()} />
              </div>
            </Card>
          )}

          <SectionCard title="Channels" action={{ label: "Manage", href: "/dashboard/settings/whatsapp" }}>
            <div className="space-y-3">
              <ChannelRow name="WhatsApp Business" connected={waAccount?.status === "CONNECTED"} />
              <ChannelRow name="Telegram" soon />
              <ChannelRow name="Instagram DM" soon />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function dayName(letter: string): string {
  return { S: "Saturday", M: "Monday", T: "Tuesday", W: "Wednesday", F: "Friday" }[letter] ?? "It";
}

function Donut({ percent }: { percent: number }) {
  const size = 116, stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e1eff4" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#0e7490"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="800" fill="#1c1f2a">
        {percent}%
      </text>
    </svg>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-sub">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <div className="text-lg font-extrabold text-ink">{value}</div>
      <div className="text-xs text-sub">{label}</div>
    </div>
  );
}

function ChannelRow({ name, connected, soon }: { name: string; connected?: boolean; soon?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink">
        <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-brand" : "bg-line"}`} />
        {name}
      </span>
      {soon ? (
        <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs text-faint">Coming soon</span>
      ) : (
        <span
          className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${
            connected ? "bg-brand-soft text-brand-ink" : "bg-warm/15 text-warm"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      )}
    </div>
  );
}
