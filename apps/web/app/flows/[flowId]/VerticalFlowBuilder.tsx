"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Zap, MessageSquare, HelpCircle, GitBranch, Settings2, Tag,
  Sparkles, Users, Clock, Octagon, Plus, Trash2, X, Check, Loader2, type LucideIcon,
} from "lucide-react";
import type { FlowGraph } from "@watool/types";
import { saveFlowAction, publishFlowAction } from "@/lib/actions/flows";

// ── step kinds ──────────────────────────────────────────────────────────────
type Kind =
  | "sendMessage" | "askQuestion" | "condition" | "setAttribute"
  | "addTag" | "aiReply" | "assignAgent" | "delay" | "end";

type Step = { id: string; kind: Kind; data: any; branches?: { yes: Step[]; no: Step[] } };

const META: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  sendMessage: { label: "Send message", icon: MessageSquare, color: "#0e7490" },
  askQuestion: { label: "Ask a question", icon: HelpCircle, color: "#2bb3e0" },
  condition: { label: "Condition", icon: GitBranch, color: "#e0698a" },
  setAttribute: { label: "Set attribute", icon: Settings2, color: "#56a8d8" },
  addTag: { label: "Add tag", icon: Tag, color: "#34c08a" },
  aiReply: { label: "AI reply", icon: Sparkles, color: "#8366d6" },
  assignAgent: { label: "Handoff to agent", icon: Users, color: "#f3a05a" },
  delay: { label: "Wait / delay", icon: Clock, color: "#97a1b0" },
  end: { label: "End", icon: Octagon, color: "#97a1b0" },
};
const PALETTE: Kind[] = ["sendMessage", "askQuestion", "condition", "addTag", "setAttribute", "aiReply", "assignAgent", "delay", "end"];

const uid = () => "n_" + Math.random().toString(36).slice(2, 10);

function defaultData(kind: Kind): any {
  switch (kind) {
    case "sendMessage": return { bodyType: "text", text: "Hello! 🌿", buttons: [] };
    case "askQuestion": return { prompt: "What's your name?", variable: "name", validation: "none" };
    case "condition": return { rules: [{ variable: "answer", op: "contains", value: "", targetHandle: "yes" }], defaultHandle: "no" };
    case "setAttribute": return { attribute: "key", value: "value" };
    case "addTag": return { tags: ["lead"] };
    case "aiReply": return { systemPrompt: "You are a helpful WhatsApp support assistant. Reply concisely.", knowledge: "", model: "", maxTokens: 512, saveToVariable: "" };
    case "assignAgent": return { team: null, note: "" };
    case "delay": return { seconds: 60 };
    case "end": return {};
  }
}

function summary(s: Step): string {
  const d = s.data;
  switch (s.kind) {
    case "sendMessage": return d.text || "(empty message)";
    case "askQuestion": return `“${d.prompt}” → {{${d.variable}}}`;
    case "condition": return `if ${d.rules?.[0]?.variable} ${d.rules?.[0]?.op} ${d.rules?.[0]?.value || "…"}`;
    case "setAttribute": return `${d.attribute} = ${d.value}`;
    case "addTag": return (d.tags ?? []).join(", ");
    case "aiReply": return "Claude answers the customer";
    case "assignAgent": return d.note || "Hand off to a human";
    case "delay": return `wait ${d.seconds}s`;
    case "end": return "stop the flow";
  }
}

// ── (de)serialize tree ↔ graph ──────────────────────────────────────────────
function serialize(trigger: any, steps: Step[]): FlowGraph {
  const nodes: any[] = [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: trigger }];
  const edges: any[] = [];
  let y = 1;
  const emit = (list: Step[], prevId: string, handle: string | null, x: number) => {
    let pid = prevId, ph = handle;
    for (const s of list) {
      nodes.push({ id: s.id, type: s.kind, position: { x, y: y++ * 100 }, data: s.data });
      edges.push({ id: `${pid}->${s.id}`, source: pid, target: s.id, sourceHandle: ph });
      if (s.kind === "condition" && s.branches) {
        emit(s.branches.yes, s.id, "yes", x - 220);
        emit(s.branches.no, s.id, "no", x + 220);
        return;
      }
      pid = s.id; ph = null;
    }
  };
  emit(steps, "trigger", null, 0);
  return { nodes, edges } as FlowGraph;
}

function deserialize(graph: FlowGraph): { trigger: any; steps: Step[] } {
  const trig = graph.nodes.find((n) => n.type === "trigger");
  const trigger = trig?.data ?? { mode: "keyword", keywords: [], matchType: "contains" };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const next = (src: string, handle: string | null): string | undefined =>
    graph.edges.find((e) => e.source === src && (e.sourceHandle ?? null) === handle)?.target;

  const follow = (startId: string, handle: string | null): Step[] => {
    const out: Step[] = [];
    let cur = next(startId, handle);
    while (cur && byId.has(cur) && !visited.has(cur)) {
      visited.add(cur);
      const node = byId.get(cur)!;
      if (node.type === "trigger" || node.type === "httpRequest") break;
      if (node.type === "condition") {
        out.push({
          id: node.id, kind: "condition", data: node.data,
          branches: {
            yes: follow(node.id, (node.data as any).rules?.[0]?.targetHandle ?? "yes"),
            no: follow(node.id, (node.data as any).defaultHandle ?? "no"),
          },
        });
        break;
      }
      out.push({ id: node.id, kind: node.type as Kind, data: node.data });
      cur = next(node.id, null);
    }
    return out;
  };
  return { trigger, steps: trig ? follow(trig.id, null) : [] };
}

// immutable tree ops
function updateById(steps: Step[], id: string, patch: any): Step[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, data: { ...s.data, ...patch } };
    if (s.branches) return { ...s, branches: { yes: updateById(s.branches.yes, id, patch), no: updateById(s.branches.no, id, patch) } };
    return s;
  });
}
function removeById(steps: Step[], id: string): Step[] {
  return steps.filter((s) => s.id !== id).map((s) =>
    s.branches ? { ...s, branches: { yes: removeById(s.branches.yes, id), no: removeById(s.branches.no, id) } } : s,
  );
}
function newStep(kind: Kind): Step {
  const s: Step = { id: uid(), kind, data: defaultData(kind) };
  if (kind === "condition") s.branches = { yes: [], no: [] };
  return s;
}
function findStep(list: Step[], id: string): Step | null {
  for (const s of list) {
    if (s.id === id) return s;
    if (s.branches) {
      const f = findStep(s.branches.yes, id) ?? findStep(s.branches.no, id);
      if (f) return f;
    }
  }
  return null;
}

export function VerticalFlowBuilder({
  flowId, name, status, initialGraph, knownVariables,
}: {
  flowId: string; name: string; status: string; initialGraph: FlowGraph; knownVariables: string[];
}) {
  const init = useMemo(() => deserialize(initialGraph), [initialGraph]);
  const [trigger, setTrigger] = useState<any>(init.trigger);
  const [steps, setSteps] = useState<Step[]>(init.steps);
  const [selId, setSelId] = useState<string | "trigger" | null>("trigger");
  const [adding, setAdding] = useState<{ owner: string; key?: "yes" | "no" } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const variables = useMemo(() => {
    const set = new Set(knownVariables);
    const walk = (l: Step[]) => l.forEach((s) => { if (s.kind === "askQuestion") set.add(s.data.variable); if (s.branches) { walk(s.branches.yes); walk(s.branches.no); } });
    walk(steps);
    return [...set].filter(Boolean).sort();
  }, [steps, knownVariables]);

  // add a step into a target list
  function addStep(kind: Kind) {
    if (!adding) return;
    const step = newStep(kind);
    if (adding.owner === "main") {
      setSteps((s) => [...s, step]);
    } else {
      // into a condition branch
      const insert = (list: Step[]): Step[] =>
        list.map((s) =>
          s.id === adding.owner && s.branches
            ? { ...s, branches: { ...s.branches, [adding.key!]: [...s.branches[adding.key!], step] } }
            : s.branches ? { ...s, branches: { yes: insert(s.branches.yes), no: insert(s.branches.no) } } : s,
        );
      setSteps(insert);
    }
    setAdding(null);
    setSelId(step.id);
  }

  function patchStep(id: string, patch: any) { setSteps((s) => updateById(s, id, patch)); }
  function deleteStep(id: string) { setSteps((s) => removeById(s, id)); if (selId === id) setSelId(null); }

  async function onSave(publish: boolean) {
    const graph = serialize(trigger, steps);
    setMsg(null);
    startTransition(async () => {
      const res = publish ? await publishFlowAction(flowId, graph) : await saveFlowAction(flowId, graph);
      setMsg(res?.error ? { kind: "err", text: res.error } : { kind: "ok", text: res?.ok ?? "Saved" });
    });
  }

  const selectedStep = useMemo(
    () => (selId && selId !== "trigger" ? findStep(steps, selId) : null),
    [selId, steps],
  );

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Link href="/dashboard/flows" className="grid h-9 w-9 place-items-center rounded-btn text-sub hover:bg-canvas">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{name}</div>
          <span className={`text-xs font-semibold ${status === "PUBLISHED" ? "text-brand" : "text-faint"}`}>
            {status === "PUBLISHED" ? "● Live" : "Draft"}
          </span>
        </div>
        {msg && (
          <span className={`text-xs font-medium ${msg.kind === "ok" ? "text-emerald-600" : "text-rose"}`}>{msg.text}</span>
        )}
        <button onClick={() => onSave(false)} disabled={pending} className="rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas disabled:opacity-60">
          Save
        </button>
        <button onClick={() => onSave(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Publish
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div
          className="flex-1 overflow-auto p-10"
          style={{ backgroundImage: "radial-gradient(#d7dee7 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          onClick={() => setAdding(null)}
        >
          <div className="mx-auto flex max-w-md flex-col items-stretch">
            {/* Trigger */}
            <TriggerCard data={trigger} selected={selId === "trigger"} onClick={() => setSelId("trigger")} />
            <StepList
              steps={steps}
              selId={selId}
              onSelect={setSelId}
              onDelete={deleteStep}
              adding={adding}
              setAdding={setAdding}
              addStep={addStep}
              owner="main"
            />
          </div>
        </div>

        {/* Config panel */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-white p-4">
          {selId === "trigger" ? (
            <TriggerConfig data={trigger} onChange={(p) => setTrigger((t: any) => ({ ...t, ...p }))} />
          ) : selectedStep ? (
            <StepConfig step={selectedStep} variables={variables} onChange={(p) => patchStep(selectedStep!.id, p)} onDelete={() => deleteStep(selectedStep!.id)} />
          ) : (
            <p className="text-sm text-faint">Select a step to edit it, or add one with the ＋ buttons.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── connector + add button ───────────────────────────────────────────────────
function Connector() { return <div className="mx-auto h-6 w-px bg-line" />; }

function AddButton({ open, onToggle, onPick }: { open: boolean; onToggle: () => void; onPick: (k: Kind) => void }) {
  return (
    <div className="relative mx-auto" onClick={(e) => e.stopPropagation()}>
      <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-brand shadow-sm hover:bg-brand-soft">
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-1/2 z-20 mt-1 w-52 -translate-x-1/2 overflow-hidden rounded-card border border-line bg-white py-1 shadow-card-lg">
          {PALETTE.map((k) => {
            const m = META[k]; const Icon = m.icon;
            return (
              <button key={k} onClick={() => onPick(k)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-canvas">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><Icon className="h-4 w-4" /></span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── cards ─────────────────────────────────────────────────────────────────────
function TriggerCard({ data, selected, onClick }: { data: any; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full rounded-card border bg-white p-3 text-left shadow-card transition ${selected ? "border-brand ring-2 ring-brand/25" : "border-line"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "#8366d61a", color: "#8366d6" }}><Zap className="h-4 w-4" /></span>
        <span className="text-sm font-bold text-ink">When a conversation starts</span>
      </div>
      <div className="mt-1.5 pl-[42px] text-xs text-sub">
        {data.mode === "anyMessage" ? "on any message" : `keywords: ${(data.keywords ?? []).join(", ") || "(none yet)"}`}
      </div>
    </button>
  );
}

function StepList({
  steps, selId, onSelect, onDelete, adding, setAdding, addStep, owner,
}: {
  steps: Step[]; selId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void;
  adding: { owner: string; key?: "yes" | "no" } | null; setAdding: (a: any) => void; addStep: (k: Kind) => void; owner: string;
}) {
  const isAddingHere = adding?.owner === owner && !adding?.key;
  return (
    <>
      {steps.map((s) => {
        const m = META[s.kind]; const Icon = m.icon; const selected = s.id === selId;
        return (
          <div key={s.id}>
            <Connector />
            <button onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
              className={`group relative w-full rounded-card border bg-white p-3 text-left shadow-card transition ${selected ? "border-brand ring-2 ring-brand/25" : "border-line hover:border-brand/40"}`}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><Icon className="h-4 w-4" /></span>
                <span className="flex-1 text-sm font-bold text-ink">{m.label}</span>
                <span onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-rose">
                  <Trash2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-1.5 truncate pl-[42px] text-xs text-sub">{summary(s)}</div>
            </button>
            {s.kind === "condition" && s.branches && (
              <div className="mt-1 grid grid-cols-2 gap-3">
                {(["yes", "no"] as const).map((bk) => (
                  <div key={bk} className="rounded-card border border-dashed border-line p-2">
                    <div className="mb-1 text-center text-[11px] font-bold uppercase tracking-wide" style={{ color: bk === "yes" ? "#34c08a" : "#e0698a" }}>{bk}</div>
                    <StepList steps={s.branches![bk]} selId={selId} onSelect={onSelect} onDelete={onDelete} adding={adding} setAdding={setAdding} addStep={addStep} owner={`${s.id}:${bk}`} />
                    <div className="mt-1"><AddButton open={adding?.owner === s.id && adding?.key === bk} onToggle={() => setAdding(adding?.owner === s.id && adding?.key === bk ? null : { owner: s.id, key: bk })} onPick={addStep} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {/* add at end of this list (only for linear lists, not after a condition) */}
      {!(steps.length && steps[steps.length - 1]!.kind === "condition") && owner === "main" && (
        <>
          <Connector />
          <AddButton open={isAddingHere} onToggle={() => setAdding(isAddingHere ? null : { owner })} onPick={addStep} />
        </>
      )}
    </>
  );
}

// ── config panels ─────────────────────────────────────────────────────────────
const inp = "mt-1 w-full rounded-btn border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const lbl = "block text-xs font-semibold text-ink";

function TriggerConfig({ data, onChange }: { data: any; onChange: (p: any) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-ink">Trigger</h2>
      <div>
        <label className={lbl}>Start the flow on</label>
        <select className={inp} value={data.mode} onChange={(e) => onChange({ mode: e.target.value })}>
          <option value="keyword">a keyword</option>
          <option value="anyMessage">any message</option>
        </select>
      </div>
      {data.mode === "keyword" && (
        <div>
          <label className={lbl}>Keywords (comma-separated)</label>
          <input className={inp} value={(data.keywords ?? []).join(", ")} onChange={(e) => onChange({ keywords: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="hi, hello, start" />
        </div>
      )}
    </div>
  );
}

function StepConfig({ step, variables, onChange, onDelete }: { step: Step; variables: string[]; onChange: (p: any) => void; onDelete: () => void }) {
  const d = step.data;
  const m = META[step.kind];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><m.icon className="h-4 w-4" /></span>
        <h2 className="text-sm font-bold text-ink">{m.label}</h2>
      </div>

      {step.kind === "sendMessage" && (
        <>
          <div>
            <label className={lbl}>Type</label>
            <select className={inp} value={["image", "document", "video"].includes(d.bodyType) ? d.bodyType : "text"} onChange={(e) => onChange({ bodyType: e.target.value })}>
              <option value="text">Text</option><option value="image">Image</option><option value="document">Document</option><option value="video">Video</option>
            </select>
          </div>
          {["image", "document", "video"].includes(d.bodyType) && (
            <div><label className={lbl}>Media URL</label><input className={inp} value={d.mediaUrl ?? ""} onChange={(e) => onChange({ mediaUrl: e.target.value || undefined })} placeholder="https://…" /></div>
          )}
          <div><label className={lbl}>{["image", "document", "video"].includes(d.bodyType) ? "Caption" : "Message"}</label><textarea className={inp} rows={4} value={d.text} onChange={(e) => onChange({ text: e.target.value })} /></div>
          <p className="text-[10px] text-faint">Use {"{{variable}}"} to insert collected answers.</p>
        </>
      )}

      {step.kind === "askQuestion" && (
        <>
          <div><label className={lbl}>Question</label><textarea className={inp} rows={3} value={d.prompt} onChange={(e) => onChange({ prompt: e.target.value })} /></div>
          <div>
            <label className={lbl}>Save answer to variable</label>
            <input className={inp} list="cl-vars" value={d.variable} onChange={(e) => onChange({ variable: e.target.value.replace(/\s+/g, "_") })} />
            <datalist id="cl-vars">{variables.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className={lbl}>Validation</label>
            <select className={inp} value={d.validation} onChange={(e) => onChange({ validation: e.target.value })}>
              <option value="none">None</option><option value="email">Email</option><option value="number">Number</option><option value="phone">Phone</option>
            </select>
          </div>
        </>
      )}

      {step.kind === "condition" && (
        <>
          <p className="text-xs text-sub">Branch the flow on a collected value.</p>
          <div><label className={lbl}>Variable</label><input className={inp} value={d.rules?.[0]?.variable ?? ""} onChange={(e) => onChange({ rules: [{ ...d.rules[0], variable: e.target.value }] })} /></div>
          <div><label className={lbl}>Operator</label>
            <select className={inp} value={d.rules?.[0]?.op ?? "contains"} onChange={(e) => onChange({ rules: [{ ...d.rules[0], op: e.target.value }] })}>
              {["eq", "neq", "contains", "gt", "lt", "exists", "notExists"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Value</label><input className={inp} value={d.rules?.[0]?.value ?? ""} onChange={(e) => onChange({ rules: [{ ...d.rules[0], value: e.target.value }] })} /></div>
        </>
      )}

      {step.kind === "setAttribute" && (
        <>
          <div><label className={lbl}>Attribute</label><input className={inp} value={d.attribute} onChange={(e) => onChange({ attribute: e.target.value })} /></div>
          <div><label className={lbl}>Value</label><input className={inp} value={d.value} onChange={(e) => onChange({ value: e.target.value })} /></div>
        </>
      )}

      {step.kind === "addTag" && (
        <div><label className={lbl}>Tags (comma-separated)</label><input className={inp} value={(d.tags ?? []).join(", ")} onChange={(e) => onChange({ tags: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} /></div>
      )}

      {step.kind === "aiReply" && (
        <>
          <div><label className={lbl}>System prompt</label><textarea className={inp} rows={3} value={d.systemPrompt} onChange={(e) => onChange({ systemPrompt: e.target.value })} /></div>
          <div><label className={lbl}>Knowledge (optional)</label><textarea className={inp} rows={3} value={d.knowledge} onChange={(e) => onChange({ knowledge: e.target.value })} /></div>
        </>
      )}

      {step.kind === "assignAgent" && (
        <div><label className={lbl}>Note for the agent</label><input className={inp} value={d.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} /></div>
      )}

      {step.kind === "delay" && (
        <div><label className={lbl}>Wait (seconds)</label><input type="number" className={inp} value={d.seconds} onChange={(e) => onChange({ seconds: Math.max(1, parseInt(e.target.value || "1", 10)) })} /></div>
      )}

      {step.kind === "end" && <p className="text-xs text-sub">Stops the conversation flow.</p>}

      <button onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-btn bg-rose/10 px-3 py-2 text-sm font-semibold text-rose hover:bg-rose/15">
        <Trash2 className="h-4 w-4" /> Delete step
      </button>
    </div>
  );
}
