"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MessageCircle, Check } from "lucide-react";
import { setActiveChannelAction } from "@/lib/actions/channel";

export type ChannelOpt = { id: string; label: string };

/** Header dropdown to focus the inbox on one connected WhatsApp number. */
export function ChannelSwitcher({ channels, activeId }: { channels: ChannelOpt[]; activeId: string | null }) {
  const router = useRouter();
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

  if (channels.length === 0) return null;
  const active = channels.find((c) => c.id === activeId);

  async function pick(id: string) {
    setOpen(false);
    await setActiveChannelAction(id);
    router.refresh();
  }

  const item = (id: string, label: string, on: boolean) => (
    <button
      key={id}
      onClick={() => pick(id)}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-sub hover:bg-canvas"
    >
      <span className="truncate">{label}</span>
      {on && <Check className="h-4 w-4 shrink-0 text-brand" />}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Filter the inbox by WhatsApp number"
        className="flex items-center gap-2 rounded-card border border-line bg-white px-2.5 py-1.5 text-sm font-semibold text-ink hover:bg-canvas"
      >
        <MessageCircle className="h-4 w-4 text-[#1da851]" />
        <span className="hidden max-w-[140px] truncate sm:block">{active ? active.label : "All channels"}</span>
        <ChevronDown className="h-4 w-4 text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-card border border-line bg-white py-1 shadow-card-lg">
          <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-faint">Inbox channel</div>
          {item("all", "All channels", !activeId)}
          {channels.map((c) => item(c.id, c.label, activeId === c.id))}
        </div>
      )}
    </div>
  );
}
