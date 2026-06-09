"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MoreVertical, UserCheck, Bot } from "lucide-react";
import { setConversationStatusAction } from "@/lib/actions/inbox";

export function ConversationActions({
  conversationId,
  status,
}: {
  conversationId: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      {status !== "CLOSED" && (
        <form action={setConversationStatusAction}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="status" value="CLOSED" />
          <button className="inline-flex items-center gap-1.5 rounded-btn bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand/15">
            <Check className="h-4 w-4" /> Resolve
          </button>
        </form>
      )}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-full text-sub hover:bg-canvas"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-card border border-line bg-white py-1 shadow-card-lg">
            {status !== "AGENT" && (
              <form action={setConversationStatusAction}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="status" value="AGENT" />
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas">
                  <UserCheck className="h-4 w-4" /> Take over
                </button>
              </form>
            )}
            {status !== "BOT" && (
              <form action={setConversationStatusAction}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="status" value="BOT" />
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-sub hover:bg-canvas">
                  <Bot className="h-4 w-4" /> Return to bot
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
