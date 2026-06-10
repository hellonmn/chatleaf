"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { MessageSquarePlus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import {
  createSavedReplyAction,
  updateSavedReplyAction,
  deleteSavedReplyAction,
  type ReplyState,
} from "@/lib/actions/saved-replies";

export type Reply = { id: string; title: string; shortcut: string | null; body: string };

const inp = "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const lbl = "block text-xs font-semibold text-ink";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {label}
    </button>
  );
}

export function RepliesManager({ replies }: { replies: Reply[] }) {
  const router = useRouter();
  const [state, action] = useActionState<ReplyState, FormData>(createSavedReplyAction, undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) { formRef.current?.reset(); router.refresh(); }
  }, [state, router]);

  return (
    <div className="space-y-6">
      {/* New reply */}
      <div className="rounded-card border border-line bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"><MessageSquarePlus className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold text-ink">New saved reply</h2>
        </div>
        <form ref={formRef} action={action} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={lbl}>Title</label>
              <input name="title" className={`mt-1 ${inp}`} placeholder="Greeting" maxLength={80} />
            </div>
            <div>
              <label className={lbl}>Shortcut (optional)</label>
              <div className="mt-1 flex items-center rounded-btn border border-line bg-white pl-2.5 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                <span className="text-sm text-faint">/</span>
                <input name="shortcut" className="w-full bg-transparent px-1 py-2 text-sm outline-none" placeholder="hi" maxLength={40} />
              </div>
            </div>
          </div>
          <div>
            <label className={lbl}>Message</label>
            <textarea name="body" rows={3} className={`mt-1 ${inp}`} placeholder="Hi! 🌿 Thanks for reaching out — how can I help?" maxLength={4096} />
          </div>
          {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <div className="flex justify-end"><SaveButton label="Add reply" /></div>
        </form>
      </div>

      {/* Existing */}
      <div className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-faint">
          {replies.length} saved {replies.length === 1 ? "reply" : "replies"}
        </div>
        {replies.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-faint">
            No saved replies yet. Add one above — agents can insert it in the inbox with <code className="rounded bg-canvas px-1">/shortcut</code>.
          </p>
        ) : (
          replies.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} reply={r} onDone={() => setEditing(null)} />
            ) : (
              <ReadRow key={r.id} reply={r} onEdit={() => setEditing(r.id)} />
            ),
          )
        )}
      </div>
    </div>
  );
}

function ReadRow({ reply, onEdit }: { reply: Reply; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-line bg-white p-3 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{reply.title}</span>
          {reply.shortcut && <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">/{reply.shortcut}</span>}
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-sub">{reply.body}</p>
      </div>
      <button onClick={onEdit} title="Edit" className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-canvas"><Pencil className="h-4 w-4" /></button>
      <form action={deleteSavedReplyAction}>
        <input type="hidden" name="id" value={reply.id} />
        <button title="Delete" className="grid h-8 w-8 place-items-center rounded-md text-faint hover:bg-rose/10 hover:text-rose"><Trash2 className="h-4 w-4" /></button>
      </form>
    </div>
  );
}

function EditRow({ reply, onDone }: { reply: Reply; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<ReplyState, FormData>(updateSavedReplyAction, undefined);
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);

  return (
    <form action={action} className="space-y-3 rounded-card border border-brand/40 bg-white p-3 shadow-card ring-2 ring-brand/15">
      <input type="hidden" name="id" value={reply.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={lbl}>Title</label>
          <input name="title" defaultValue={reply.title} className={`mt-1 ${inp}`} maxLength={80} />
        </div>
        <div>
          <label className={lbl}>Shortcut</label>
          <div className="mt-1 flex items-center rounded-btn border border-line bg-white pl-2.5 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
            <span className="text-sm text-faint">/</span>
            <input name="shortcut" defaultValue={reply.shortcut ?? ""} className="w-full bg-transparent px-1 py-2 text-sm outline-none" maxLength={40} />
          </div>
        </div>
      </div>
      <div>
        <label className={lbl}>Message</label>
        <textarea name="body" defaultValue={reply.body} rows={3} className={`mt-1 ${inp}`} maxLength={4096} />
      </div>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm font-semibold text-sub hover:bg-canvas"><X className="h-4 w-4" /> Cancel</button>
        <SaveButton label="Save" />
      </div>
    </form>
  );
}
