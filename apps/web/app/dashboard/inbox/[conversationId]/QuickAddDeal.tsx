"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { quickAddDealAction } from "@/lib/actions/crm";

/** Inline "add to CRM" form in the contact panel. Creates a deal for this
 *  contact in the default pipeline's first stage. */
export function QuickAddDeal({ contactId, defaultTitle }: { contactId: string; defaultTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-line px-2.5 py-1.5 text-xs font-semibold text-sub hover:bg-canvas"
      >
        <Plus className="h-3.5 w-3.5" /> Add deal
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set("contactId", contactId);
        startTransition(async () => {
          const r = await quickAddDealAction(undefined, fd);
          if (r?.error) { setError(r.error); return; }
          setOpen(false);
          router.refresh();
        });
      }}
      className="space-y-2 rounded-card border border-line bg-canvas/50 p-2.5"
    >
      <input
        name="title"
        defaultValue={defaultTitle}
        autoFocus
        placeholder="Deal title"
        className="w-full rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand"
      />
      <input
        name="valueInr"
        type="number"
        min={0}
        placeholder="Value (₹, optional)"
        className="w-full rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand"
      />
      {error && <p className="text-[11px] text-rose">{error}</p>}
      <div className="flex gap-1.5">
        <button disabled={pending} className="flex-1 rounded-btn bg-brand px-2 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Add to CRM"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-btn px-2 py-1.5 text-xs text-sub hover:text-ink">Cancel</button>
      </div>
    </form>
  );
}
