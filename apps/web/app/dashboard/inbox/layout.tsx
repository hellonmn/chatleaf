import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { ConversationList, type ConversationItem } from "./ConversationList";

function snippet(message: { type: string; payload: unknown } | undefined): string {
  if (!message) return "No messages yet";
  const p = message.payload as { text?: { body?: string } } | null;
  return p?.text?.body ?? `[${message.type}]`;
}

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveContext();

  const [conversations, account] = await Promise.all([
    prisma.conversation.findMany({
      where: { orgId: ctx.orgId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    }),
    prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } }),
  ]);

  const needsReconnect = account && account.status !== "CONNECTED";

  const items: ConversationItem[] = conversations.map((c) => ({
    id: c.id,
    name: c.contact.name ?? c.contact.phone ?? c.contact.waId,
    waId: c.contact.waId,
    status: c.status,
    lastMessageAt: c.lastMessageAt.toISOString(),
    snippet: snippet(c.messages[0]),
  }));

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-2">
      {needsReconnect && (
        <Link
          href="/dashboard/settings/whatsapp"
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            WhatsApp isn&apos;t sending — your access token is invalid or expired.
            <span className="font-medium underline"> Reconnect →</span>
          </span>
        </Link>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ConversationList items={items} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
