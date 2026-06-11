"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Paperclip, X, FileText, Send, Smile, Zap, Loader2, Settings2, Sparkles } from "lucide-react";
import { extractMediaRef } from "@/lib/media-ref";
import { clock } from "@/lib/format";
import { MediaImage } from "@/components/MediaImage";
import { sendReplyAction, sendMediaReplyAction, suggestReplyAction, type ActionState } from "@/lib/actions/inbox";

export type ChatMessage = {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  payload: unknown;
  status: string;
  createdAt: string;
  optimistic?: boolean;
};

export type SavedReply = { id: string; title: string; shortcut: string | null; body: string };

function bodyText(payload: unknown, type: string): string {
  const p = payload as { text?: { body?: string }; caption?: string } | null;
  return p?.text?.body ?? p?.caption ?? `[${type}]`;
}

function Bubble({ m }: { m: ChatMessage }) {
  const out = m.direction === "OUT";
  const ref = extractMediaRef(m.payload);
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
          out ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-white text-ink shadow-sm"
        } ${m.optimistic ? "opacity-70" : ""}`}
      >
        {ref ? (
          <MediaBlock m={m} refKind={ref} out={out} />
        ) : (
          <div className="whitespace-pre-wrap break-words">{bodyText(m.payload, m.type)}</div>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${out ? "text-white/70" : "text-faint"}`}>
          {clock(m.createdAt)}
          {out && <span>· {m.status === "FAILED" ? "failed" : m.optimistic ? "sending" : m.status.toLowerCase()}</span>}
        </div>
      </div>
    </div>
  );
}

function MediaBlock({ m, refKind, out }: { m: ChatMessage; refKind: ReturnType<typeof extractMediaRef>; out: boolean }) {
  if (!refKind) return null;
  const src = refKind.link ?? `/api/media/${m.id}`;
  return (
    <div className="space-y-1">
      {refKind.kind === "image" || refKind.kind === "sticker" ? (
        <MediaImage src={src} alt={refKind.caption ?? "image"} />
      ) : refKind.kind === "video" ? (
        <video src={src} controls className="max-h-64 rounded-lg" />
      ) : refKind.kind === "audio" ? (
        <audio src={src} controls className="w-full" />
      ) : (
        <a href={src} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs underline ${out ? "bg-white/15" : "bg-black/5"}`}>
          📄 {refKind.filename ?? "Document"}
        </a>
      )}
      {refKind.caption && <div className="whitespace-pre-wrap break-words">{refKind.caption}</div>}
    </div>
  );
}

export function ChatPane({
  conversationId,
  messages,
  canSendFreeform,
  savedReplies,
  aiEnabled,
}: {
  conversationId: string;
  messages: ChatMessage[];
  canSendFreeform: boolean;
  savedReplies: SavedReply[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (cur: ChatMessage[], m: ChatMessage) => [...cur, m],
  );
  const [pending, startTransition] = useTransition();
  const [mediaState, mediaAction] = useActionState<ActionState, FormData>(sendMediaReplyAction, undefined);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  async function suggest() {
    setError(null);
    setSuggesting(true);
    try {
      const res = await suggestReplyAction(conversationId);
      if (res.text) { setText(res.text); inputRef.current?.focus(); }
      else if (res.error) setError(res.error);
    } finally {
      setSuggesting(false);
    }
  }

  useEffect(() => {
    if (mediaState?.ok) clearStaged();
  }, [mediaState?.ok]);
  const [preview, setPreview] = useState<{ name: string; isImage: boolean; url?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaFormRef = useRef<HTMLFormElement>(null);

  // Saved-reply "/" command: when the input is just `/query`, show a picker.
  const slashMatch = /^\/(\S*)$/.exec(text);
  const slashQuery = slashMatch ? slashMatch[1]!.toLowerCase() : null;
  const replyMatches =
    slashQuery !== null
      ? savedReplies
          .filter((r) => (r.shortcut ?? "").toLowerCase().includes(slashQuery) || r.title.toLowerCase().includes(slashQuery))
          .slice(0, 6)
      : [];
  const slashOpen = slashQuery !== null && replyMatches.length > 0;

  function onComposerChange(v: string) {
    // Auto-expand a fully typed `/shortcut␠` into its body.
    const done = /^\/(\S+)\s$/.exec(v);
    if (done) {
      const hit = savedReplies.find((r) => r.shortcut && r.shortcut.toLowerCase() === done[1]!.toLowerCase());
      if (hit) { setText(hit.body); return; }
    }
    setText(v);
  }
  function applyReply(r: SavedReply) {
    setText(r.body);
    inputRef.current?.focus();
  }

  // Pin to the newest message: on open, when switching conversations, and as new
  // messages arrive. Setting scrollTop directly on the container is reliable —
  // scrollIntoView can no-op before layout/images settle or fail to move when the
  // count is unchanged across a conversation switch.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId, optimistic.length]);

  function sendText() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setError(null);
    startTransition(async () => {
      addOptimistic({
        id: "tmp-" + Math.random().toString(36).slice(2),
        direction: "OUT",
        type: "text",
        payload: { text: { body: value } },
        status: "QUEUED",
        createdAt: new Date().toISOString(),
        optimistic: true,
      });
      const fd = new FormData();
      fd.set("conversationId", conversationId);
      fd.set("text", value);
      const res = await sendReplyAction(undefined, fd);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  function onPickFile() {
    const f = fileRef.current?.files?.[0];
    if (!f) return setPreview(null);
    const isImage = f.type.startsWith("image/");
    setPreview({ name: f.name, isImage, url: isImage ? URL.createObjectURL(f) : undefined });
  }
  function clearStaged() {
    if (fileRef.current) fileRef.current.value = "";
    setPreview((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });
  }

  return (
    <>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
        style={{ backgroundColor: "#f7f9fb", backgroundImage: "radial-gradient(#dce3eb 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      >
        <div className="mb-2 flex justify-center">
          <span className="rounded-pill bg-white/80 px-3 py-1 text-[11px] font-semibold text-faint shadow-sm">Today</span>
        </div>
        {optimistic.map((m) => <Bubble key={m.id} m={m} />)}
      </div>

      {/* Composer */}
      <div className="border-t border-line bg-white p-3">
        {!canSendFreeform ? (
          <div className="flex items-start gap-2 rounded-md bg-warm/15 px-3 py-3 text-sm text-[#c47a2e]">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The 24-hour reply window has closed — send an approved <strong>template</strong> via a Broadcast to re-engage.</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {!preview && !text && (
              <div className="flex flex-wrap items-center gap-2">
                {savedReplies.slice(0, 4).map((r) => (
                  <button key={r.id} type="button" onClick={() => applyReply(r)} title={r.body} className="inline-flex max-w-[240px] items-center gap-1.5 rounded-pill bg-canvas px-3 py-1.5 text-xs text-sub hover:bg-line">
                    <Zap className="h-3 w-3 shrink-0 text-warm" />
                    <span className="truncate">{r.title}</span>
                  </button>
                ))}
                <Link href="/dashboard/settings/replies" className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft">
                  <Settings2 className="h-3 w-3" /> {savedReplies.length ? "Manage" : "Add saved replies"}
                </Link>
              </div>
            )}

            <form ref={mediaFormRef} action={mediaAction}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <input ref={fileRef} type="file" name="file" className="hidden" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={onPickFile} />
              {preview && (
                <div className="rounded-card border border-line bg-canvas p-3">
                  <div className="flex items-start gap-3">
                    {preview.isImage && preview.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.url} alt="preview" className="h-20 w-20 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-white"><FileText className="h-7 w-7 text-faint" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-sub">{preview.name}</div>
                      <input name="caption" placeholder="Add a caption…" className="mt-1 w-full rounded-btn border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
                    </div>
                    <button type="button" onClick={clearStaged} className="text-faint hover:text-rose"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={clearStaged} className="rounded-btn px-3 py-1.5 text-sm text-sub hover:bg-line">Cancel</button>
                    <button type="submit" className="rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Send {preview.isImage ? "photo" : "file"}</button>
                  </div>
                </div>
              )}
            </form>

            {!preview && (
              <div className="relative">
                {slashOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden rounded-card border border-line bg-white py-1 shadow-card-lg">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-faint">Saved replies — Enter to insert</div>
                    {replyMatches.map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyReply(r); }}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-canvas ${i === 0 ? "bg-canvas/60" : ""}`}
                      >
                        <span className="mt-0.5 shrink-0 rounded-pill bg-brand-soft px-1.5 text-[10px] font-bold text-brand">/{r.shortcut ?? "…"}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-ink">{r.title}</span>
                          <span className="block truncate text-[11px] text-faint">{r.body}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-card border border-line bg-white px-3 py-2">
                  <button type="button" title="Emoji" className="shrink-0 text-faint hover:text-sub"><Smile className="h-5 w-5" /></button>
                  <button type="button" title="Attach" onClick={() => fileRef.current?.click()} className="shrink-0 text-faint hover:text-sub"><Paperclip className="h-5 w-5" /></button>
                  {aiEnabled && (
                    <button type="button" title="Suggest a reply (AI)" onClick={suggest} disabled={suggesting} className="shrink-0 text-faint transition-colors hover:text-violet disabled:opacity-50">
                      {suggesting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    </button>
                  )}
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => onComposerChange(e.target.value)}
                    placeholder="Type a message…  (try /shortcut)"
                    className="flex-1 bg-transparent text-sm outline-none"
                    onKeyDown={(e) => {
                      if (slashOpen && e.key === "Enter") { e.preventDefault(); applyReply(replyMatches[0]!); return; }
                      if (slashOpen && e.key === "Escape") { e.preventDefault(); setText(""); return; }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                    }}
                  />
                  <button
                    type="button"
                    onClick={sendText}
                    disabled={pending}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_8px_18px_rgba(14,116,144,.26)] transition-colors hover:bg-brand-dark disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {(error ?? mediaState?.error) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? mediaState?.error}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
