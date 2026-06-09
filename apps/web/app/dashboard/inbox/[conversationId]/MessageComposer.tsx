"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { sendReplyAction, type ActionState } from "@/lib/actions/inbox";
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
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box after a successful send.
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

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Type a reply…"
        className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) formRef.current?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Enter to send · Shift+Enter for a new line
        </span>
        <SubmitButton>Send</SubmitButton>
      </div>
      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
