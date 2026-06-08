import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { timeAgo } from "@/lib/format";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "BOT", label: "Bot" },
  { key: "AGENT", label: "Agent" },
  { key: "OPEN", label: "Open" },
  { key: "CLOSED", label: "Closed" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  BOT: "bg-sky-100 text-sky-700",
  AGENT: "bg-amber-100 text-amber-700",
  OPEN: "bg-slate-100 text-slate-600",
  CLOSED: "bg-slate-100 text-slate-400",
};

function snippet(message: { type: string; payload: unknown } | undefined): string {
  if (!message) return "No messages yet";
  const p = message.payload as { text?: { body?: string } } | null;
  return p?.text?.body ?? `[${message.type}]`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireActiveContext();
  const { status } = await searchParams;
  const active = status ?? "all";

  const conversations = await prisma.conversation.findMany({
    where: {
      orgId: ctx.orgId,
      ...(active !== "all" ? { status: active as never } : {}),
    },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <AutoRefresh seconds={6} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/dashboard/inbox" : `/dashboard/inbox?status=${f.key}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                active === f.key
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No conversations yet. They appear here when someone messages your
          connected WhatsApp number.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/inbox/${c.id}`}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand-ink">
                {(c.contact.name ?? c.contact.waId).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {c.contact.name ?? c.contact.phone ?? c.contact.waId}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <div className="truncate text-sm text-slate-500">
                  {snippet(c.messages[0])}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_STYLE[c.status] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {c.status.toLowerCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
