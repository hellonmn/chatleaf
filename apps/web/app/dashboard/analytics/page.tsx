import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getActiveChannelId } from "@/lib/active-channel";
import { Card } from "@/components/ui/Card";
import { MessageSquare, CheckCheck, Eye, Timer, UserPlus, Users } from "lucide-react";
import { WaIcon } from "@/components/WaIcon";

// ── helpers ─────────────────────────────────────────────────────────────────
function dur(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

type Msg = { createdAt: Date; direction: string; payload: unknown };
function sentBy(payload: unknown): string | null {
  const p = payload as { sentByUserId?: string } | null;
  return p && typeof p.sentByUserId === "string" ? p.sentByUserId : null;
}

export default async function AnalyticsPage() {
  const ctx = await requireActiveContext();
  const orgId = ctx.orgId;
  const now = Date.now();
  const since30 = new Date(now - 30 * 86_400_000);
  const since14 = new Date(now - 14 * 86_400_000);

  // Scope every metric to the active channel (null = all channels).
  const ch = await getActiveChannelId();
  const channelName = ch
    ? (await prisma.phoneNumber.findUnique({ where: { id: ch }, select: { displayNumber: true } }))?.displayNumber ?? "Unknown number"
    : null;
  const msgCh = ch ? { conversation: { phoneNumberId: ch } } : {};
  const convCh = ch ? { phoneNumberId: ch } : {};
  const contactCh = ch ? { conversations: { some: { phoneNumberId: ch } } } : {};
  const flowCh = ch ? { OR: [{ phoneNumberId: null }, { phoneNumberId: ch }] } : {};

  const [
    outStatuses, volume, newContacts, activeConvos,
    members, flows, runStats, repliesRaw, convos,
  ] = await Promise.all([
    prisma.message.groupBy({
      by: ["status"],
      where: { orgId, direction: "OUT", createdAt: { gte: since30 }, ...msgCh },
      _count: true,
    }),
    prisma.message.findMany({
      where: { orgId, createdAt: { gte: since14 }, ...msgCh },
      select: { createdAt: true, direction: true },
      take: 20000,
    }),
    prisma.contact.count({ where: { orgId, createdAt: { gte: since30 }, ...contactCh } }),
    prisma.conversation.count({ where: { orgId, status: { in: ["OPEN", "AGENT"] }, ...convCh } }),
    prisma.membership.findMany({ where: { orgId }, include: { user: true } }),
    prisma.flow.findMany({ where: { orgId, ...flowCh }, select: { id: true, name: true, status: true } }),
    prisma.flowRun.groupBy({ by: ["flowId", "status"], where: { orgId, ...(ch ? { flow: flowCh } : {}) }, _count: true }),
    prisma.message.findMany({
      where: { orgId, direction: "OUT", createdAt: { gte: since30 }, ...msgCh },
      select: { payload: true },
      take: 8000,
    }),
    prisma.conversation.findMany({
      where: { orgId, lastMessageAt: { gte: since30 }, ...convCh },
      select: {
        assignedUserId: true,
        messages: { select: { createdAt: true, direction: true, payload: true }, orderBy: { createdAt: "asc" }, take: 40 },
      },
      take: 400,
    }),
  ]);

  // Outbound delivery breakdown.
  const sc: Record<string, number> = {};
  for (const r of outStatuses) sc[r.status] = r._count;
  const sent = (sc.SENT ?? 0) + (sc.DELIVERED ?? 0) + (sc.READ ?? 0);
  const delivered = (sc.DELIVERED ?? 0) + (sc.READ ?? 0);
  const read = sc.READ ?? 0;
  const failed = sc.FAILED ?? 0;

  // 14-day volume buckets.
  const days: { key: string; label: string; in: number; out: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    days.push({ key: dayKey(d), label: String(d.getUTCDate()), in: 0, out: 0 });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const m of volume) {
    const b = byKey.get(dayKey(m.createdAt));
    if (b) (m.direction === "IN" ? (b.in += 1) : (b.out += 1));
  }
  const maxDay = Math.max(1, ...days.map((d) => d.in + d.out));

  // Response times + per-agent attribution (first agent reply after first inbound).
  const firstResponses: number[] = [];
  const agentResp = new Map<string, number[]>();
  for (const c of convos as { assignedUserId: string | null; messages: Msg[] }[]) {
    const firstIn = c.messages.find((m) => m.direction === "IN");
    if (!firstIn) continue;
    const firstOut = c.messages.find((m) => m.direction === "OUT" && m.createdAt > firstIn.createdAt);
    if (firstOut) firstResponses.push(firstOut.createdAt.getTime() - firstIn.createdAt.getTime());
    const firstAgent = c.messages.find((m) => m.direction === "OUT" && m.createdAt > firstIn.createdAt && sentBy(m.payload));
    if (firstAgent) {
      const uid = sentBy(firstAgent.payload)!;
      (agentResp.get(uid) ?? agentResp.set(uid, []).get(uid)!).push(firstAgent.createdAt.getTime() - firstIn.createdAt.getTime());
    }
  }
  const avgFirst = firstResponses.length ? firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length : 0;

  // Per-agent reply volume.
  const repliesByUser = new Map<string, number>();
  for (const m of repliesRaw) {
    const uid = sentBy(m.payload);
    if (uid) repliesByUser.set(uid, (repliesByUser.get(uid) ?? 0) + 1);
  }
  const agents = members
    .map((m) => {
      const list = agentResp.get(m.userId) ?? [];
      return {
        name: m.user.name ?? m.user.email,
        role: m.role,
        replies: repliesByUser.get(m.userId) ?? 0,
        avg: list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0,
      };
    })
    .sort((a, b) => b.replies - a.replies);

  // Flow funnels.
  const runMap = new Map<string, { total: number; completed: number }>();
  for (const r of runStats) {
    const e = runMap.get(r.flowId) ?? { total: 0, completed: 0 };
    e.total += r._count;
    if (r.status === "COMPLETED") e.completed += r._count;
    runMap.set(r.flowId, e);
  }
  const flowRows = flows
    .map((f) => ({ name: f.name, status: f.status, ...(runMap.get(f.id) ?? { total: 0, completed: 0 }) }))
    .filter((f) => f.total > 0 || f.status === "PUBLISHED")
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-sub">Last 30 days · {ctx.orgName}</p>
        </div>
        {channelName && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#1da851]">
            <WaIcon className="h-3.5 w-3.5" /> {channelName}
          </span>
        )}
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Hero icon={<MessageSquare className="h-4 w-4" />} label="Messages sent" value={sent.toLocaleString()} sub={`${failed} failed`} />
        <Hero icon={<CheckCheck className="h-4 w-4" />} label="Delivery rate" value={`${pct(delivered, sent)}%`} sub={`${delivered.toLocaleString()} delivered`} />
        <Hero icon={<Eye className="h-4 w-4" />} label="Read rate" value={`${pct(read, sent)}%`} sub={`${read.toLocaleString()} read`} />
        <Hero icon={<Timer className="h-4 w-4" />} label="Avg first response" value={dur(avgFirst)} sub={`${firstResponses.length} conversations`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Volume chart */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Message volume</h2>
            <div className="flex items-center gap-3 text-xs text-sub">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Sent</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky" /> Received</span>
            </div>
          </div>
          <div className="mt-4 flex h-44 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.out} sent · ${d.in} received`}>
                <div className="flex w-full flex-col justify-end" style={{ height: "9rem" }}>
                  <div className="w-full rounded-t-sm bg-sky" style={{ height: `${(d.in / maxDay) * 100}%` }} />
                  <div className="w-full bg-brand" style={{ height: `${(d.out / maxDay) * 100}%` }} />
                </div>
                <span className="text-[9px] text-faint">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Delivery funnel + contacts */}
        <Card className="p-5">
          <h2 className="text-sm font-bold text-ink">Delivery</h2>
          <div className="mt-4 space-y-3">
            <Bar label="Sent" value={sent} max={sent} color="bg-brand" />
            <Bar label="Delivered" value={delivered} max={sent} color="bg-mid" />
            <Bar label="Read" value={read} max={sent} color="bg-sky" />
            <Bar label="Failed" value={failed} max={Math.max(sent, 1)} color="bg-rose" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <MiniStat icon={<UserPlus className="h-4 w-4" />} label="New contacts" value={newContacts} />
            <MiniStat icon={<Users className="h-4 w-4" />} label="Active chats" value={activeConvos} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agents */}
        <Card className="overflow-hidden">
          <h2 className="px-5 pt-5 text-sm font-bold text-ink">Team performance</h2>
          {agents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-faint">No team activity yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
                  <th className="px-5 py-2">Agent</th>
                  <th className="px-3 py-2 text-right">Replies</th>
                  <th className="px-5 py-2 text-right">Avg response</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.name} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="font-semibold text-ink">{a.name}</span>
                      <span className="ml-1.5 text-[11px] text-faint">{a.role.toLowerCase()}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{a.replies.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-sub">{dur(a.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Flows */}
        <Card className="p-5">
          <h2 className="text-sm font-bold text-ink">Flow performance</h2>
          {flowRows.length === 0 ? (
            <p className="mt-4 text-sm text-faint">No flows yet. Build one in Automations.</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {flowRows.map((f) => (
                <div key={f.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-semibold text-ink">{f.name}</span>
                    <span className="shrink-0 text-xs text-sub">{f.completed}/{f.total} done · {pct(f.completed, f.total)}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct(f.completed, f.total)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── small components ────────────────────────────────────────────────────────
function Hero({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-sub">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-canvas text-sub">{icon}</span>
      <div>
        <div className="text-lg font-bold text-ink">{value.toLocaleString()}</div>
        <div className="text-[11px] text-faint">{label}</div>
      </div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-sub">{label}</span>
        <span className="font-semibold text-ink">{value.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}
