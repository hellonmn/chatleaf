import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { InboxRealtime } from "@/components/InboxRealtime";
import { EnableNotifications } from "@/components/EnableNotifications";
import { ConversationList, type ConversationItem } from "./ConversationList";

function snippet(message: { type: string; payload: unknown } | undefined): string {
  if (!message) return "No messages yet";
  const p = message.payload as { text?: { body?: string }; caption?: string } | null;
  return p?.text?.body ?? p?.caption ?? `[${message.type}]`;
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
      messages: { orderBy: { createdAt: "desc" }, take: 15 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  const items: ConversationItem[] = conversations.map((c) => {
    const name = c.contact.name ?? c.contact.phone ?? c.contact.waId;
    // unread = trailing inbound messages (newest-first until the first outbound)
    let unread = 0;
    for (const m of c.messages) {
      if (m.direction === "IN") unread++;
      else break;
    }
    return {
      id: c.id,
      name,
      waId: c.contact.waId,
      status: c.status,
      lastMessageAt: c.lastMessageAt.toISOString(),
      snippet: snippet(c.messages[0]),
      unread,
      resolved: c.status === "CLOSED",
      assignedToMe: c.assignedUserId === ctx.userId,
      color: avatarColor(name + c.contact.waId),
    };
  });

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-card border border-line bg-white">
      <InboxRealtime />
      <EnableNotifications />
      <ConversationList items={items} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
