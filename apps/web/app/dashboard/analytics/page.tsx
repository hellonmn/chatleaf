import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default async function AnalyticsPage() {
  const ctx = await requireActiveContext();
  const orgId = ctx.orgId;

  const [
    contacts,
    optedIn,
    convoOpen,
    convoBot,
    convoAgent,
    msgIn,
    msgOut,
    msgFailed,
    flowsPublished,
    runsTotal,
    runsCompleted,
    broadcasts,
    recipientsSent,
  ] = await Promise.all([
    prisma.contact.count({ where: { orgId } }),
    prisma.contact.count({ where: { orgId, optInStatus: "OPTED_IN" } }),
    prisma.conversation.count({ where: { orgId, status: "OPEN" } }),
    prisma.conversation.count({ where: { orgId, status: "BOT" } }),
    prisma.conversation.count({ where: { orgId, status: "AGENT" } }),
    prisma.message.count({ where: { orgId, direction: "IN" } }),
    prisma.message.count({ where: { orgId, direction: "OUT" } }),
    prisma.message.count({ where: { orgId, status: "FAILED" } }),
    prisma.flow.count({ where: { orgId, status: "PUBLISHED" } }),
    prisma.flowRun.count({ where: { orgId } }),
    prisma.flowRun.count({ where: { orgId, status: "COMPLETED" } }),
    prisma.broadcast.count({ where: { orgId } }),
    prisma.broadcastRecipient.count({
      where: { broadcast: { orgId }, status: { in: ["sent", "delivered", "read"] } },
    }),
  ]);

  const completion = runsTotal ? Math.round((runsCompleted / runsTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">A snapshot of {ctx.orgName}.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Contacts</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Contacts" value={contacts} />
          <Stat label="Opted in" value={optedIn} sub={`${contacts ? Math.round((optedIn / contacts) * 100) : 0}% of contacts`} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Conversations</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="With bot" value={convoBot} />
          <Stat label="With agent" value={convoAgent} />
          <Stat label="Open" value={convoOpen} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Messages</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Received" value={msgIn} />
          <Stat label="Sent" value={msgOut} />
          <Stat label="Failed" value={msgFailed} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Automation</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Published flows" value={flowsPublished} />
          <Stat label="Flow runs" value={runsTotal} />
          <Stat label="Completion" value={`${completion}%`} sub={`${runsCompleted} completed`} />
          <Stat label="Broadcast sends" value={recipientsSent} sub={`${broadcasts} broadcast(s)`} />
        </div>
      </div>
    </div>
  );
}
