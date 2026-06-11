"use client";

import { useRef } from "react";
import { assignConversationAction } from "@/lib/actions/inbox";

export function AssignControl({
  conversationId,
  assignedUserId,
  members,
}: {
  conversationId: string;
  assignedUserId: string | null;
  members: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={assignConversationAction}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <select
        name="userId"
        defaultValue={assignedUserId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm font-medium text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </form>
  );
}
