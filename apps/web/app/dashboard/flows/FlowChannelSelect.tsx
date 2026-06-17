"use client";

import { useRouter } from "next/navigation";
import { setFlowChannelAction } from "@/lib/actions/flows";

/** Per-flow channel picker: assign a flow to one WhatsApp number or all channels. */
export function FlowChannelSelect({
  flowId,
  current,
  channels,
}: {
  flowId: string;
  current: string | null;
  channels: { id: string; label: string }[];
}) {
  const router = useRouter();
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("flowId", flowId);
    fd.set("channelId", e.target.value);
    await setFlowChannelAction(fd);
    router.refresh();
  }
  return (
    <select
      defaultValue={current ?? ""}
      onChange={onChange}
      title="Which WhatsApp number this flow runs on"
      className="rounded-btn border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand"
    >
      <option value="">All channels</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}
