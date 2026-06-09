import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { clock } from "@/lib/format";
import { setConversationStatusAction } from "@/lib/actions/inbox";
import { extractMediaRef } from "@watool/wa";
import { MessageComposer } from "./MessageComposer";
import { ContactPanel } from "./ContactPanel";

function body(payload: unknown, type: string): string {
  const p = payload as { text?: { body?: string } } | null;
  return p?.text?.body ?? `[${type}]`;
}

/** Render an image/video/audio/document via the auth'd media proxy, else text. */
function MessageContent({ m }: { m: { id: string; payload: unknown; type: string } }) {
  const ref = extractMediaRef(m.payload);
  if (!ref) {
    return <div className="whitespace-pre-wrap break-words">{body(m.payload, m.type)}</div>;
  }
  const src = ref.link ?? `/api/media/${m.id}`;
  return (
    <div className="space-y-1">
      {ref.kind === "image" || ref.kind === "sticker" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={ref.caption ?? "image"} className="max-h-64 rounded-lg" />
      ) : ref.kind === "video" ? (
        <video src={src} controls className="max-h-64 rounded-lg" />
      ) : ref.kind === "audio" ? (
        <audio src={src} controls className="w-full" />
      ) : (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-xs underline"
        >
          📄 {ref.filename ?? "Document"}
        </a>
      )}
      {ref.caption && <div className="whitespace-pre-wrap break-words">{ref.caption}</div>}
    </div>
  );
}

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

  const windowOpen =
    !!convo.windowExpiresAt && convo.windowExpiresAt.getTime() > Date.now();
  const name = convo.contact.name ?? convo.contact.phone ?? convo.contact.waId;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <AutoRefresh seconds={5} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/inbox" className="text-slate-400 hover:text-slate-600 md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand-ink">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">
              {convo.contact.waId}
              {convo.assignedUser ? ` · ${convo.assignedUser.name ?? convo.assignedUser.email}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {convo.status.toLowerCase()}
          </span>
          {convo.status !== "AGENT" && (
            <form action={setConversationStatusAction}>
              <input type="hidden" name="conversationId" value={convo.id} />
              <input type="hidden" name="status" value="AGENT" />
              <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">
                Take over
              </button>
            </form>
          )}
          {convo.status === "AGENT" && (
            <form action={setConversationStatusAction}>
              <input type="hidden" name="conversationId" value={convo.id} />
              <input type="hidden" name="status" value="BOT" />
              <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">
                Return to bot
              </button>
            </form>
          )}
          {convo.status !== "CLOSED" && (
            <form action={setConversationStatusAction}>
              <input type="hidden" name="conversationId" value={convo.id} />
              <input type="hidden" name="status" value="CLOSED" />
              <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">
                Close
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
        {convo.messages.map((m) => {
          const out = m.direction === "OUT";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  out
                    ? "rounded-br-sm bg-brand text-white"
                    : "rounded-bl-sm bg-white text-slate-800 shadow-sm"
                }`}
              >
                <MessageContent m={m} />
                <div
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    out ? "text-white/70" : "text-slate-400"
                  }`}
                >
                  {clock(m.createdAt)}
                  {out && (
                    <span>
                      ·{" "}
                      {m.status === "FAILED"
                        ? "failed"
                        : m.status.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3">
        <MessageComposer conversationId={convo.id} canSendFreeform={windowOpen} />
      </div>
      </div>

      <ContactPanel contact={convo.contact} />
    </div>
  );
}
