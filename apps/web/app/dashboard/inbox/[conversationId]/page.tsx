import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { razorpayConfigured } from "@/lib/razorpay";
import { AutoRefresh } from "@/components/AutoRefresh";
import { avatarColor } from "@/lib/avatar";
import { ContactPanel } from "./ContactPanel";
import { ConversationActions } from "./ConversationActions";
import { RunFlowMenu } from "./RunFlowMenu";
import { ChatPane, type ChatMessage } from "./ChatPane";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const ctx = await requireActiveContext();
  const { conversationId } = await params;

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    include: {
      contact: { include: { contactTags: { include: { tag: true } } } },
      assignedUser: true,
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!convo) notFound();

  // Flows the agent can run on demand (newest first; skip archived).
  const flows = await prisma.flow.findMany({
    where: { orgId: ctx.orgId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true },
    take: 50,
  });

  const savedReplies = await prisma.savedReply.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, shortcut: true, body: true },
    take: 50,
  });

  const memberRows = await prisma.membership.findMany({
    where: { orgId: ctx.orgId },
    include: { user: { select: { name: true, email: true } } },
  });
  const members = memberRows.map((m) => ({
    id: m.userId,
    name: (m.user.name ?? m.user.email) + (m.userId === ctx.userId ? " (you)" : ""),
  }));

  const windowOpen =
    !!convo.windowExpiresAt && convo.windowExpiresAt.getTime() > Date.now();
  const name = convo.contact.name ?? convo.contact.phone ?? convo.contact.waId;
  const headColor = avatarColor(name + convo.contact.waId);
  const chatMessages: ChatMessage[] = convo.messages.map((m) => ({
    id: m.id,
    direction: m.direction as "IN" | "OUT",
    type: m.type,
    payload: m.payload,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <AutoRefresh seconds={20} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/inbox" className="text-faint hover:text-ink md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="relative">
            <span
              className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: headColor }}
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#25D366]" />
          </span>
          <div>
            <div className="text-sm font-bold text-ink">{name}</div>
            <div className="flex items-center gap-1.5 text-xs text-sub">
              <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
              Online · typically replies in minutes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RunFlowMenu conversationId={convo.id} flows={flows} />
          <ConversationActions conversationId={convo.id} status={convo.status} />
        </div>
      </div>

      <ChatPane
        conversationId={convo.id}
        messages={chatMessages}
        canSendFreeform={windowOpen}
        savedReplies={savedReplies}
        billingLive={razorpayConfigured()}
      />
      </div>

      <ContactPanel
        contact={convo.contact}
        conversationId={convo.id}
        assignedUserId={convo.assignedUserId}
        members={members}
      />
    </div>
  );
}
