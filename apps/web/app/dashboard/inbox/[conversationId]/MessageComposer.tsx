"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, Paperclip, FileText, X } from "lucide-react";
import {
  sendReplyAction,
  sendMediaReplyAction,
  type ActionState,
} from "@/lib/actions/inbox";
import { SubmitButton } from "@/components/SubmitButton";

type Preview = { name: string; isImage: boolean; url?: string };

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

  // Clear the staged file + preview after a successful media send.
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
      <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The 24-hour reply window has closed. Free-form replies aren&apos;t allowed
          now — an approved <strong>template</strong> is required. Use a{" "}
          <strong>Broadcast</strong> template to re-engage.
        </span>
      </div>
    );
  }

  const error = state?.error ?? mediaState?.error;

  return (
    <div className="space-y-2">
      {/* Media form holds the (hidden) file input, caption, and the send button.
          Selecting a file only STAGES it — sending requires confirming below. */}
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-3">
              {preview.isImage && preview.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt="preview"
                  className="h-20 w-20 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-white">
                  <FileText className="h-7 w-7 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-slate-500">{preview.name}</div>
                <input
                  name="caption"
                  placeholder="Add a caption (optional)…"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <button
                type="button"
                onClick={clearStaged}
                title="Discard"
                className="text-slate-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={clearStaged}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <SubmitButton>Send {preview.isImage ? "photo" : "file"}</SubmitButton>
            </div>
          </div>
        )}
      </form>

      {/* Text composer — hidden while a media attachment is staged */}
      {!preview && (
        <div className="flex items-end gap-2">
          <button
            type="button"
            title="Attach a file"
            onClick={() => fileRef.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <form ref={formRef} action={action} className="flex flex-1 items-end gap-2">
            <input type="hidden" name="conversationId" value={conversationId} />
            <textarea
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              placeholder="Type a reply…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) formRef.current?.requestSubmit();
                }
              }}
            />
            <SubmitButton className="h-10">Send</SubmitButton>
          </form>
        </div>
      )}

      {!preview && (
        <div className="text-xs text-slate-400">
          Enter to send · Shift+Enter for a new line · attach to send a photo or file
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
