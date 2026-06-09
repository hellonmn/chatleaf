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

  const conversations = await prisma.conversation.findMany({
    where: { orgId: ctx.orgId },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  const items: ConversationItem[] = conversations.map((c) => ({
    id: c.id,
    name: c.contact.name ?? c.contact.phone ?? c.contact.waId,
    waId: c.contact.waId,
    status: c.status,
    lastMessageAt: c.lastMessageAt.toISOString(),
    snippet: snippet(c.messages[0]),
  }));

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ConversationList items={items} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
