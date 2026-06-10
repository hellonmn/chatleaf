"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Workflow } from "lucide-react";
import { runFlowAction, type ActionState } from "@/lib/actions/inbox";

type FlowOption = { id: string; name: string; status: string };

/** Header control that force-runs a bot flow on the open conversation. */
export function RunFlowMenu({
  conversationId,
  flows,
}: {
  conversationId: string;
  flows: FlowOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [state, action] = useActionState<ActionState, FormData>(runFlowAction, undefined);

  // Close the menu after a successful start.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Run a bot flow on this chat"
        className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
      >
        <Workflow className="h-4 w-4" /> Run flow
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-card border border-line bg-white py-1 shadow-card-lg">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">
            Run a flow now
          </div>
          {flows.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">
              No flows yet. Build one in Automations.
            </p>
          ) : (
            <form action={action} className="max-h-72 overflow-y-auto">
              <input type="hidden" name="conversationId" value={conversationId} />
              {flows.map((f) => (
                <FlowItem key={f.id} f={f} />
              ))}
            </form>
          )}
          {state?.error && <p className="px-3 py-2 text-xs text-rose">{state.error}</p>}
          {state?.ok && <p className="px-3 py-2 text-xs text-emerald-600">{state.ok}</p>}
        </div>
      )}
    </div>
  );
}

function FlowItem({ f }: { f: FlowOption }) {
  const { pending } = useFormStatus();
  const live = f.status === "PUBLISHED";
  return (
    <button
      type="submit"
      name="flowId"
      value={f.id}
      disabled={pending}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-canvas disabled:opacity-50"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Workflow className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{f.name}</span>
      <span
        className={`shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-bold ${
          live ? "bg-emerald-50 text-emerald-600" : "bg-canvas text-faint"
        }`}
      >
        {live ? "Live" : "Draft"}
      </span>
    </button>
  );
}
