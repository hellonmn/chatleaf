"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, Paperclip, Loader2 } from "lucide-react";
import {
  sendReplyAction,
  sendMediaReplyAction,
  type ActionState,
} from "@/lib/actions/inbox";
import { SubmitButton } from "@/components/SubmitButton";

export function MessageComposer({
  conversationId,
  canSendFreeform,
}: {
  conversationId: string;
  canSendFreeform: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    sendReplyAction,
    undefined,
  );
  const [mediaState, mediaAction, mediaPending] = useActionState<ActionState, FormData>(
    sendMediaReplyAction,
    undefined,
  );
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const mediaFormRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) setText("");
  }, [state?.ok]);

  if (!canSendFreeform) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The 24-hour reply window has closed. Free-form replies aren&apos;t
          allowed now — an approved <strong>template</strong> is required. Use a{" "}
          <strong>Broadcast</strong> template to re-engage.
        </span>
      </div>
    );
  }

  const error = state?.error ?? mediaState?.error;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        {/* Attach: a hidden file input auto-submits its own form on change */}
        <form ref={mediaFormRef} action={mediaAction}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input
            ref={fileRef}
            type="file"
            name="file"
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={() => {
              if (fileRef.current?.files?.length) mediaFormRef.current?.requestSubmit();
            }}
          />
          <button
            type="button"
            title="Attach a file"
            onClick={() => fileRef.current?.click()}
            disabled={mediaPending}
            className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            {mediaPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
        </form>

        {/* Text reply */}
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

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Enter to send · Shift+Enter for a new line · 📎 to attach
        </span>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
