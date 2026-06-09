"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Clock, Paperclip, X, FileText, Send, Smile, Zap, Loader2 } from "lucide-react";
import {
  sendReplyAction,
  sendMediaReplyAction,
  type ActionState,
} from "@/lib/actions/inbox";
import { SubmitButton } from "@/components/SubmitButton";

type Preview = { name: string; isImage: boolean; url?: string };

const QUICK_REPLIES = [
  "Hi! 🎉 Thanks for reaching out — how can I help?",
  "Here's the demo link: chatleaf.in/demo",
  "Our festive offer ends this Sunday 🌿",
];

function RoundSend() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_8px_18px_rgba(14,116,144,.26)] transition-colors hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
    </button>
  );
}

export function MessageComposer({
  conversationId,
  canSendFreeform,
}: {
  conversationId: string;
  canSendFreeform: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(sendReplyAction, undefined);
  const [mediaState, mediaAction] = useActionState<ActionState, FormData>(
    sendMediaReplyAction,
    undefined,
  );

  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) setText("");
  }, [state?.ok]);
  useEffect(() => {
    if (mediaState?.ok) clearStaged();
  }, [mediaState?.ok]);

  function clearStaged() {
    if (fileRef.current) fileRef.current.value = "";
    setPreview((p) => {
      if (p?.url) URL.revokeObjectURL(p.url);
      return null;
    });
  }
  function onPickFile() {
    const f = fileRef.current?.files?.[0];
    if (!f) return clearStaged();
    const isImage = f.type.startsWith("image/");
    setPreview({ name: f.name, isImage, url: isImage ? URL.createObjectURL(f) : undefined });
  }

  if (!canSendFreeform) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-warm/15 px-3 py-3 text-sm text-[#c47a2e]">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The 24-hour reply window has closed — send an approved{" "}
          <strong>template</strong> via a Broadcast to re-engage.
        </span>
      </div>
    );
  }

  const error = state?.error ?? mediaState?.error;

  return (
    <div className="space-y-2.5">
      {/* Quick replies */}
      {!preview && (
        <div className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setText(r)}
              className="inline-flex max-w-[240px] items-center gap-1.5 rounded-pill bg-canvas px-3 py-1.5 text-xs text-sub hover:bg-line"
            >
              <Zap className="h-3 w-3 shrink-0 text-warm" />
              <span className="truncate">{r}</span>
            </button>
          ))}
        </div>
      )}

      {/* Media staging */}
      <form action={mediaAction}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={onPickFile}
        />
        {preview && (
          <div className="rounded-card border border-line bg-canvas p-3">
            <div className="flex items-start gap-3">
              {preview.isImage && preview.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt="preview" className="h-20 w-20 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-white">
                  <FileText className="h-7 w-7 text-faint" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-sub">{preview.name}</div>
                <input
                  name="caption"
                  placeholder="Add a caption (optional)…"
                  className="mt-1 w-full rounded-btn border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <button type="button" onClick={clearStaged} className="text-faint hover:text-rose">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" onClick={clearStaged} className="rounded-btn px-3 py-1.5 text-sm text-sub hover:bg-line">
                Cancel
              </button>
              <SubmitButton>Send {preview.isImage ? "photo" : "file"}</SubmitButton>
            </div>
          </div>
        )}
      </form>

      {/* Composer bar */}
      {!preview && (
        <form ref={formRef} action={action} className="flex items-center gap-2 rounded-card border border-line bg-white px-3 py-2">
          <input type="hidden" name="conversationId" value={conversationId} />
          <button type="button" title="Emoji" className="shrink-0 text-faint hover:text-sub">
            <Smile className="h-5 w-5" />
          </button>
          <button type="button" title="Attach" onClick={() => fileRef.current?.click()} className="shrink-0 text-faint hover:text-sub">
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-transparent text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) formRef.current?.requestSubmit();
              }
            }}
          />
          <RoundSend />
        </form>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
