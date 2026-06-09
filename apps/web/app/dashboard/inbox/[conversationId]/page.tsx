import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { clock } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { extractMediaRef } from "@watool/wa";
import { MediaImage } from "@/components/MediaImage";
import { MessageComposer } from "./MessageComposer";
import { ContactPanel } from "./ContactPanel";
import { ConversationActions } from "./ConversationActions";

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
        <MediaImage src={src} alt={ref.caption ?? "image"} />
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
  const headColor = avatarColor(name + convo.contact.waId);
  const assignedTo = convo.assignedUser
    ? `${convo.assignedUser.name ?? convo.assignedUser.email}${convo.assignedUser.id === ctx.userId ? " (you)" : ""}`
    : null;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <AutoRefresh seconds={5} />

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
        <ConversationActions conversationId={convo.id} status={convo.status} />
      </div>

      {/* Messages */}
      <div
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
        style={{
          backgroundColor: "#f7f9fb",
          backgroundImage: "radial-gradient(#dce3eb 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="mb-2 flex justify-center">
          <span className="rounded-pill bg-white/80 px-3 py-1 text-[11px] font-semibold text-faint shadow-sm">
            Today
          </span>
        </div>
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

      <ContactPanel contact={convo.contact} assignedTo={assignedTo} />
    </div>
  );
}
