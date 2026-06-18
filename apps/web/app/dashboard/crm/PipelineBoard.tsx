"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Trash2, Settings2, Check, Loader2, GripVertical, MessageCircle } from "lucide-react";
import {
  createDealAction, updateDealAction, deleteDealAction, moveDealAction,
  addStageAction, deleteStageAction, createPipelineAction, deletePipelineAction,
} from "@/lib/actions/crm";
import { CrmRealtime } from "./CrmRealtime";

type Contact = { id: string; name: string | null; waId: string };
type Member = { id: string; name: string | null; email: string };
type Deal = {
  id: string; title: string; valuePaise: number; status: string; note: string | null;
  assignedUserId: string | null;
  dueDate: string | null;
  contact: Contact | null;
};
type Stage = { id: string; name: string; color: string; won: boolean; lost: boolean; deals: Deal[] };

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const contactLabel = (c: Contact | null) => (c ? c.name || c.waId : null);

/** Days from today to a due date (negative = overdue). null if no date. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}
const dueLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const ymd = (iso: string) => new Date(iso).toISOString().slice(0, 10); // for <input type=date>
const memberName = (m: Member) => m.name || m.email;
const initials = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
// Deterministic avatar colour from a user id (no Math.random — stable across renders).
const AVATAR_COLORS = ["#0e7490", "#8366d6", "#0e9f6e", "#e0698a", "#f3a05a", "#2bb3e0"];
const avatarColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

function Avatar({ name, id, size = 20 }: { name: string; id: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: avatarColor(id), fontSize: size * 0.42 }}
    >
      {initials(name)}
    </span>
  );
}

export function PipelineBoard({
  pipelines, activePipelineId, stages, contacts, members, currentUserId, contactConversations, canManage,
}: {
  pipelines: { id: string; name: string }[];
  activePipelineId: string;
  stages: Stage[];
  contacts: Contact[];
  members: Member[];
  currentUserId: string;
  contactConversations: Record<string, string>;
  canManage: boolean;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // all | me | <userId>
  const matchesFilter = (deal: Deal) =>
    assigneeFilter === "all" ||
    (assigneeFilter === "me" ? deal.assignedUserId === currentUserId : deal.assignedUserId === assigneeFilter);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // stageId
  const [editing, setEditing] = useState<Deal | null>(null);
  const [managing, setManaging] = useState(false);

  const totalValue = stages.reduce((s, st) => s + st.deals.reduce((a, d) => a + d.valuePaise, 0), 0);
  const totalDeals = stages.reduce((s, st) => s + st.deals.length, 0);

  // Analytics — computed from the full (unfiltered) pipeline.
  const allDeals = stages.flatMap((s) => s.deals);
  const openDeals = allDeals.filter((d) => d.status === "OPEN");
  const openValue = openDeals.reduce((a, d) => a + d.valuePaise, 0);
  const wonDeals = allDeals.filter((d) => d.status === "WON");
  const wonValue = wonDeals.reduce((a, d) => a + d.valuePaise, 0);
  const lostCount = allDeals.filter((d) => d.status === "LOST").length;
  const closed = wonDeals.length + lostCount;
  const winRate = closed > 0 ? Math.round((wonDeals.length / closed) * 100) : null;

  function switchPipeline(id: string) {
    router.push(`/dashboard/crm?pipeline=${id}`);
  }

  function move(dealId: string, stageId: string) {
    setDragId(null);
    setOverStage(null);
    startTransition(async () => {
      await moveDealAction(dealId, stageId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <CrmRealtime />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={activePipelineId}
            onChange={(e) => switchPipeline(e.target.value)}
            className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="text-sm text-sub">{totalDeals} deals · {inr(totalValue)}</span>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-faint" />}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm font-semibold text-sub"
            title="Filter by assignee"
          >
            <option value="all">All assignees</option>
            <option value="me">My deals</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{memberName(m)}</option>
            ))}
          </select>
          {canManage && (
            <button
              onClick={() => setManaging((m) => !m)}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
            >
              <Settings2 className="h-4 w-4" /> Manage
            </button>
          )}
        </div>
      </div>

      {/* Analytics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open deals" value={String(openDeals.length)} sub={inr(openValue)} />
        <Stat label="Won" value={String(wonDeals.length)} sub={inr(wonValue)} />
        <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} sub={`${closed} closed`} />
        <Stat label="Pipeline value" value={inr(openValue)} sub={`${openDeals.length} open`} />
      </div>

      {/* Manage panel */}
      {managing && canManage && (
        <div className="space-y-3 rounded-card border border-line bg-white p-4">
          <form action={addStageAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="pipelineId" value={activePipelineId} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-sub">New stage</label>
              <input name="name" placeholder="Stage name" required className="rounded-btn border border-line px-3 py-1.5 text-sm" />
            </div>
            <input name="color" type="color" defaultValue="#0e7490" className="h-9 w-12 rounded-btn border border-line" />
            <button className="rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Add stage</button>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <form action={createPipelineAction} className="flex items-end gap-2">
              <input name="name" placeholder="New pipeline" required className="rounded-btn border border-line px-3 py-1.5 text-sm" />
              <button className="rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">Create pipeline</button>
            </form>
            {pipelines.length > 1 && (
              <form action={deletePipelineAction} className="ml-auto">
                <input type="hidden" name="pipelineId" value={activePipelineId} />
                <button className="rounded-btn bg-rose/10 px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose/15">Delete this pipeline</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((stage) => {
          const visibleDeals = stage.deals.filter(matchesFilter);
          const stageValue = visibleDeals.reduce((a, d) => a + d.valuePaise, 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, stage.id); }}
              className={`flex w-72 shrink-0 flex-col rounded-card border bg-canvas/60 ${
                overStage === stage.id ? "border-brand ring-2 ring-brand/30" : "border-line"
              }`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                <span className="text-sm font-bold text-ink">{stage.name}</span>
                <span className="text-xs text-faint">{visibleDeals.length}</span>
                <span className="ml-auto text-xs font-semibold text-sub">{inr(stageValue)}</span>
                {managing && canManage && (
                  <DeleteStageButton stageId={stage.id} />
                )}
              </div>

              {/* Cards */}
              <div className="flex min-h-[60px] flex-1 flex-col gap-2 px-2 pb-2">
                {visibleDeals.map((deal) => {
                  const convoId = deal.contact ? contactConversations[deal.contact.id] : undefined;
                  return (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => setDragId(deal.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setEditing(deal)}
                    className={`group relative cursor-pointer rounded-card border border-line bg-white p-2.5 shadow-sm transition-shadow hover:shadow-card ${
                      dragId === deal.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
                      {convoId && (
                        <Link
                          href={`/dashboard/inbox/${convoId}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Open chat"
                          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 hover:bg-canvas hover:text-brand group-hover:opacity-100"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Link>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{deal.title}</div>
                        {contactLabel(deal.contact) && (
                          <div className="mt-0.5 truncate text-xs text-sub">{contactLabel(deal.contact)}</div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5">
                          {deal.valuePaise > 0 && (
                            <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-ink">
                              {inr(deal.valuePaise)}
                            </span>
                          )}
                          {deal.dueDate && deal.status === "OPEN" && (() => {
                            const dleft = daysUntil(deal.dueDate);
                            const overdue = dleft != null && dleft < 0;
                            const soon = dleft != null && dleft >= 0 && dleft <= 2;
                            return (
                              <span
                                className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                                  overdue ? "bg-rose/15 text-rose" : soon ? "bg-warm/15 text-[#c47a2e]" : "bg-canvas text-sub"
                                }`}
                                title={overdue ? "Overdue" : "Due date"}
                              >
                                {dueLabel(deal.dueDate)}
                              </span>
                            );
                          })()}
                          {deal.assignedUserId && memberById.has(deal.assignedUserId) && (
                            <span className="ml-auto">
                              <Avatar
                                id={deal.assignedUserId}
                                name={memberName(memberById.get(deal.assignedUserId)!)}
                                size={20}
                              />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* Add deal */}
                {adding === stage.id ? (
                  <AddDealForm
                    pipelineId={activePipelineId}
                    stageId={stage.id}
                    contacts={contacts}
                    onDone={() => { setAdding(null); router.refresh(); }}
                    onCancel={() => setAdding(null)}
                  />
                ) : (
                  <button
                    onClick={() => setAdding(stage.id)}
                    className="flex items-center justify-center gap-1 rounded-card border border-dashed border-line py-2 text-xs font-semibold text-sub hover:bg-white"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add deal
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditDealModal
          deal={editing}
          members={members}
          conversationId={editing.contact ? contactConversations[editing.contact.id] : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-xl font-extrabold text-ink">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function DeleteStageButton({ stageId }: { stageId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="relative">
      <button
        title="Delete stage"
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("stageId", stageId);
            const r = await deleteStageAction(undefined, fd);
            if (r?.error) setErr(r.error);
          });
        }}
        className="text-faint hover:text-rose"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {err && <span className="absolute right-0 top-5 z-10 w-40 rounded bg-rose px-2 py-1 text-[10px] text-white">{err}</span>}
    </span>
  );
}

function AddDealForm({
  pipelineId, stageId, contacts, onDone, onCancel,
}: {
  pipelineId: string; stageId: string; contacts: Contact[];
  onDone: () => void; onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("pipelineId", pipelineId);
        fd.set("stageId", stageId);
        startTransition(async () => {
          const r = await createDealAction(undefined, fd);
          if (r?.error) setError(r.error);
          else onDone();
        });
      }}
      className="space-y-2 rounded-card border border-line bg-white p-2.5"
    >
      <input name="title" placeholder="Deal title" required autoFocus className="w-full rounded-btn border border-line px-2 py-1.5 text-sm" />
      <select name="contactId" defaultValue="" className="w-full rounded-btn border border-line px-2 py-1.5 text-sm">
        <option value="">No contact</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>{c.name || c.waId}</option>
        ))}
      </select>
      <input name="valueInr" type="number" min={0} placeholder="Value (₹)" className="w-full rounded-btn border border-line px-2 py-1.5 text-sm" />
      {error && <p className="text-[11px] text-rose">{error}</p>}
      <div className="flex gap-1.5">
        <button disabled={pending} className="flex-1 rounded-btn bg-brand px-2 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-btn px-2 py-1.5 text-xs text-sub hover:text-ink">Cancel</button>
      </div>
    </form>
  );
}

function EditDealModal({ deal, members, conversationId, onClose, onSaved }: { deal: Deal; members: Member[]; conversationId?: string; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Edit deal</h3>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        {contactLabel(deal.contact) && (
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-sm text-sub">{contactLabel(deal.contact)}</p>
            {conversationId && (
              <Link
                href={`/dashboard/inbox/${conversationId}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-btn bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-ink hover:bg-brand/15"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Open chat
              </Link>
            )}
          </div>
        )}
        <form
          action={(fd) => {
            fd.set("dealId", deal.id);
            startTransition(async () => {
              const r = await updateDealAction(undefined, fd);
              if (r?.error) setError(r.error);
              else onSaved();
            });
          }}
          className="mt-4 space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Title</label>
            <input name="title" defaultValue={deal.title} required className="w-full rounded-btn border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Value (₹)</label>
            <input name="valueInr" type="number" min={0} defaultValue={deal.valuePaise / 100} className="w-full rounded-btn border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Assign to</label>
            <select name="assignedUserId" defaultValue={deal.assignedUserId ?? ""} className="w-full rounded-btn border border-line px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Due date</label>
            <input name="dueDate" type="date" defaultValue={deal.dueDate ? ymd(deal.dueDate) : ""} className="w-full rounded-btn border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Note</label>
            <textarea name="note" defaultValue={deal.note ?? ""} rows={3} className="w-full rounded-btn border border-line px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-rose">{error}</p>}
          <div className="flex items-center gap-2">
            <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </button>
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("dealId", deal.id);
                  await deleteDealAction(fd);
                  onSaved();
                });
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-btn bg-rose/10 px-3 py-2 text-sm font-semibold text-rose hover:bg-rose/15"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
