"use client";

import {
  useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowLeft, Zap, MessageSquare, HelpCircle, GitBranch, Settings2, Tag, Sparkles,
  Users, Clock, Octagon, Plus, Trash2, Check, Loader2, Maximize2, Minus, X,
  MousePointer2, Wand2, MoveVertical, MoveHorizontal, type LucideIcon,
} from "lucide-react";
import type { FlowGraph } from "@watool/types";
import { saveFlowAction, publishFlowAction } from "@/lib/actions/flows";

// ── types ─────────────────────────────────────────────────────────────────────
type Kind =
  | "trigger" | "sendMessage" | "askQuestion" | "condition" | "setAttribute"
  | "addTag" | "aiReply" | "assignAgent" | "delay" | "end";

type GNode = { id: string; type: Kind; position: { x: number; y: number }; data: any };
type GEdge = { id: string; source: string; target: string; sourceHandle: string | null };

const META: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  trigger: { label: "Trigger", icon: Zap, color: "#8366d6" },
  sendMessage: { label: "Message", icon: MessageSquare, color: "#0e7490" },
  askQuestion: { label: "Question", icon: HelpCircle, color: "#2bb3e0" },
  condition: { label: "Condition", icon: GitBranch, color: "#e0698a" },
  setAttribute: { label: "Set attribute", icon: Settings2, color: "#56a8d8" },
  addTag: { label: "Add tag", icon: Tag, color: "#34c08a" },
  aiReply: { label: "AI reply", icon: Sparkles, color: "#8366d6" },
  assignAgent: { label: "Handoff to agent", icon: Users, color: "#f3a05a" },
  delay: { label: "Wait / delay", icon: Clock, color: "#97a1b0" },
  end: { label: "End", icon: Octagon, color: "#97a1b0" },
};
// Ask-question is created from Message via the "wait for reply" toggle, so it's
// not its own palette item.
const PALETTE: Kind[] = [
  "sendMessage", "condition", "addTag", "setAttribute",
  "aiReply", "assignAgent", "delay", "end",
];

const NODE_W = 232;
const HPAD = 12;
const uid = () => "n_" + Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const isButtonsMsg = (n: GNode) =>
  n.type === "sendMessage" && n.data.bodyType === "buttons" && (n.data.buttons ?? []).length > 0;

/** Horizontal position of output handle i (of `count`) within a node's width.
 *  Buttons sit under their chip (evenly across the inner width); everything else
 *  uses the classic (i+1)/(count+1) spacing. */
function outHandleX(node: GNode, i: number, count: number): number {
  if (isButtonsMsg(node)) {
    const inner = NODE_W - 2 * HPAD;
    return HPAD + (i + 0.5) * (inner / count);
  }
  return (NODE_W * (i + 1)) / (count + 1);
}

function defaultData(kind: Kind): any {
  switch (kind) {
    case "trigger": return { mode: "keyword", keywords: [], matchType: "contains" };
    case "sendMessage": return { bodyType: "text", text: "Hello! 🌿", buttons: [] };
    case "askQuestion": return { prompt: "What's your name?", variable: "name", validation: "none", buttons: [] };
    case "condition": return { rules: [{ variable: "answer", op: "contains", value: "", targetHandle: "yes" }], defaultHandle: "no" };
    case "setAttribute": return { attribute: "key", value: "value" };
    case "addTag": return { tags: ["lead"] };
    case "aiReply": return { systemPrompt: "You are a helpful WhatsApp support assistant. Reply concisely.", knowledge: "", model: "", maxTokens: 512, saveToVariable: "" };
    case "assignAgent": return { team: null, note: "" };
    case "delay": return { seconds: 60 };
    case "end": return {};
  }
}

/** Output handles for a node. "out" is the default edge (stored as sourceHandle null). */
function outputs(n: GNode): { id: string; label?: string }[] {
  if (n.type === "end" || n.type === "assignAgent") return [];
  if (n.type === "condition") return [{ id: "yes", label: "yes" }, { id: "no", label: "no" }];
  if (n.type === "sendMessage" && n.data.bodyType === "buttons" && (n.data.buttons ?? []).length > 0) {
    return n.data.buttons.map((b: any) => ({ id: b.id, label: b.label || "Button" }));
  }
  return [{ id: "out" }];
}
const hasInput = (n: GNode) => n.type !== "trigger";

function summary(n: GNode): string {
  const d = n.data;
  switch (n.type) {
    case "trigger": return d.mode === "anyMessage" ? "on any message" : `keywords: ${(d.keywords ?? []).join(", ") || "(none)"}`;
    case "sendMessage":
      if (d.bodyType === "buttons") return d.text || "(message)";
      if (["image", "document", "video"].includes(d.bodyType)) return `${d.bodyType}: ${d.text || "(caption)"}`;
      return d.text || "(empty message)";
    case "askQuestion": return `“${d.prompt}” → {{${d.variable}}}${(d.buttons ?? []).length ? ` · ${d.buttons.length} quick` : ""}`;
    case "condition": return `if ${d.rules?.[0]?.variable} ${d.rules?.[0]?.op} ${d.rules?.[0]?.value || "…"}`;
    case "setAttribute": return `${d.attribute} = ${d.value}`;
    case "addTag": return (d.tags ?? []).join(", ");
    case "aiReply": return "Claude answers the customer";
    case "assignAgent": return d.note || "Hand off to a human";
    case "delay": return `wait ${d.seconds}s`;
    case "end": return "stop the flow";
  }
}

// ── component ───────────────────────────────────────────────────────────────────
export function NodeFlowBuilder({
  flowId, name, status, initialGraph, knownVariables,
}: {
  flowId: string; name: string; status: string; initialGraph: FlowGraph; knownVariables: string[];
}) {
  const initial = useMemo(() => normalizeGraph(initialGraph), [initialGraph]);
  const [nodes, setNodes] = useState<GNode[]>(initial.nodes);
  const [edges, setEdges] = useState<GEdge[]>(initial.edges);
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [tf, setTf] = useState({ x: 60, y: 60, s: 1 });
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [wire, setWire] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Mirror state into refs so window listeners always read fresh values with
  // stable ([]) effect deps — no re-subscribing on every drag, no dep-size churn.
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const sizesRef = useRef(sizes); sizesRef.current = sizes;
  const tfRef = useRef(tf); tfRef.current = tf;
  const selRef = useRef(sel); selRef.current = sel;
  const selEdgeRef = useRef(selEdge); selEdgeRef.current = selEdge;

  const drag = useRef<
    | { kind: "node"; id: string; sx: number; sy: number; ox: number; oy: number }
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { kind: "wire"; source: string; handle: string }
    | { kind: "spawn"; nodeKind: Kind; sx: number; sy: number; moved: boolean }
    | null
  >(null);
  const [ghost, setGhost] = useState<{ kind: Kind; x: number; y: number } | null>(null);
  const [dir, setDir] = useState<"vertical" | "horizontal">("vertical");
  // measured handle centres (offset from each node's top-left, unscaled)
  const [hpts, setHpts] = useState<Record<string, { x: number; y: number }>>({});
  const hptsRef = useRef(hpts); hptsRef.current = hpts;
  const dirRef = useRef(dir); dirRef.current = dir;

  function onMeasure(id: string, h: number) {
    setSizes((s) => (s[id] === h ? s : { ...s, [id]: h }));
  }
  function onHandles(id: string, map: Record<string, { x: number; y: number }>) {
    setHpts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k in map) {
        const key = `${id}::${k}`;
        const v = map[k]!;
        const p = prev[key];
        if (!p || Math.abs(p.x - v.x) > 0.5 || Math.abs(p.y - v.y) > 0.5) { next[key] = v; changed = true; }
      }
      return changed ? next : prev;
    });
  }

  function screenToWorld(cx: number, cy: number) {
    const r = wrapRef.current!.getBoundingClientRect();
    const t = tfRef.current;
    return { x: (cx - r.left - t.x) / t.s, y: (cy - r.top - t.y) / t.s };
  }

  function handlePos(nodeId: string, handle: string | "in"): { x: number; y: number } {
    const n = nodesRef.current.find((x) => x.id === nodeId);
    if (!n) return { x: 0, y: 0 };
    // Prefer the measured handle centre — exact for any layout / orientation.
    const off = hptsRef.current[`${nodeId}::${handle}`];
    if (off) return { x: n.position.x + off.x, y: n.position.y + off.y };
    // Fallback before the first measure: direction-aware formula.
    const h = sizesRef.current[n.id] ?? 70;
    const horiz = dirRef.current === "horizontal";
    if (handle === "in") {
      return horiz ? { x: n.position.x, y: n.position.y + h / 2 } : { x: n.position.x + NODE_W / 2, y: n.position.y };
    }
    const outs = outputs(n);
    const i = Math.max(0, outs.findIndex((o) => o.id === handle));
    const cnt = outs.length || 1;
    return horiz
      ? { x: n.position.x + NODE_W, y: n.position.y + (h * (i + 1)) / (cnt + 1) }
      : { x: n.position.x + outHandleX(n, i, cnt), y: n.position.y + h };
  }

  function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
    if (dir === "horizontal") {
      const mx = (a.x + b.x) / 2;
      return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    }
    const my = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }

  // ── one set of global listeners, stable for the component's life ──
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const s = tfRef.current.s;
      if (d.kind === "node") {
        const dx = (e.clientX - d.sx) / s, dy = (e.clientY - d.sy) / s;
        setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, position: { x: d.ox + dx, y: d.oy + dy } } : n)));
      } else if (d.kind === "pan") {
        setTf((t) => ({ ...t, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
      } else if (d.kind === "wire") {
        const from = handlePos(d.source, d.handle);
        const to = screenToWorld(e.clientX, e.clientY);
        setWire({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      } else if (d.kind === "spawn") {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
        setGhost({ kind: d.nodeKind, x: e.clientX, y: e.clientY });
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (d?.kind === "wire") {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const targetId = el?.closest<HTMLElement>("[data-nodeid]")?.dataset.nodeid;
        if (targetId && targetId !== d.source) {
          const tn = nodesRef.current.find((n) => n.id === targetId);
          if (tn && hasInput(tn)) connect(d.source, d.handle, targetId);
        }
      } else if (d?.kind === "spawn") {
        const r = wrapRef.current?.getBoundingClientRect();
        const inside = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (d.moved && inside) {
          const w = screenToWorld(e.clientX, e.clientY);
          addNodeAt(d.nodeKind, w.x - NODE_W / 2, w.y - 20);
        } else if (!d.moved) {
          addNode(d.nodeKind); // treat a click as "add at center"
        }
      }
      drag.current = null;
      setWire(null);
      setGhost(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (selEdgeRef.current) { removeEdge(selEdgeRef.current); e.preventDefault(); }
      else if (selRef.current && nodesRef.current.find((n) => n.id === selRef.current)?.type !== "trigger") {
        removeNode(selRef.current); e.preventDefault();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connect(source: string, handle: string, target: string) {
    const sourceHandle = handle === "out" ? null : handle;
    setEdges((es) => [
      ...es.filter((e) => !(e.source === source && (e.sourceHandle ?? "out") === handle)),
      { id: `e_${uid()}`, source, target, sourceHandle },
    ]);
  }

  function onWheel(e: React.WheelEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const wx = (sx - tf.x) / tf.s, wy = (sy - tf.y) / tf.s;
    const s = clamp(tf.s * (e.deltaY < 0 ? 1.1 : 0.9), 0.4, 1.6);
    setTf({ s, x: sx - wx * s, y: sy - wy * s });
  }

  function addNodeAt(kind: Kind, x: number, y: number) {
    const node: GNode = { id: uid(), type: kind, position: { x, y }, data: defaultData(kind) };
    setNodes((ns) => [...ns, node]);
    setSel(node.id); setSelEdge(null);
  }
  function addNode(kind: Kind) {
    const r = wrapRef.current?.getBoundingClientRect();
    const cx = r ? (r.width / 2 - tf.x) / tf.s : 200;
    const cy = r ? (r.height / 3 - tf.y) / tf.s : 200;
    addNodeAt(kind, cx - NODE_W / 2 + Math.random() * 40, cy + Math.random() * 40);
  }

  /** Tidy tree layout: walk the graph from the trigger, centering each parent
   *  over its children. `useDir` picks the growth axis. */
  function autoArrange(useDir: "vertical" | "horizontal" = dir) {
    const horiz = useDir === "horizontal";
    const crossStep = horiz ? 132 : NODE_W + 70; // gap between siblings
    const depthStep = horiz ? NODE_W + 110 : 168; // gap between levels
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const pos = new Map<string, { cx: number; depth: number }>();
    let cursor = 0;

    const childrenOf = (id: string) => {
      const n = byId.get(id);
      if (!n) return [] as string[];
      const order = outputs(n).map((o) => o.id);
      return edges
        .filter((e) => e.source === id && byId.has(e.target))
        .sort((a, b) => order.indexOf(a.sourceHandle ?? "out") - order.indexOf(b.sourceHandle ?? "out"))
        .map((e) => e.target);
    };

    const layout = (id: string, depth: number): number => {
      const seen = pos.get(id);
      if (seen) return seen.cx;
      pos.set(id, { cx: cursor, depth }); // reserve → breaks cycles / shared children
      const kids = childrenOf(id).filter((c) => !pos.has(c));
      const centers = kids.map((c) => layout(c, depth + 1));
      let cx: number;
      if (centers.length) cx = (centers[0]! + centers[centers.length - 1]!) / 2;
      else { cx = cursor; cursor += crossStep; }
      pos.set(id, { cx, depth });
      return cx;
    };

    const trigger = nodes.find((n) => n.type === "trigger");
    if (trigger) layout(trigger.id, 0);
    for (const n of nodes) if (!pos.has(n.id)) { pos.set(n.id, { cx: cursor, depth: 0 }); cursor += crossStep; }

    setNodes((ns) => ns.map((n) => {
      const p = pos.get(n.id)!;
      const position = horiz
        ? { x: 80 + p.depth * depthStep, y: 60 + p.cx }
        : { x: 80 + p.cx, y: 60 + p.depth * depthStep };
      return { ...n, position };
    }));
    setTf({ x: 60, y: 60, s: 1 });
  }

  function patch(id: string, p: any) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  }
  /** Toggle a Message node into/out of "wait for a reply" (askQuestion). */
  function setIsQuestion(id: string, on: boolean) {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      const buttons = n.data.buttons ?? [];
      if (on) return { ...n, type: "askQuestion", data: { prompt: n.data.text ?? n.data.prompt ?? "", variable: n.data.variable ?? "reply", validation: n.data.validation ?? "none", buttons } };
      return { ...n, type: "sendMessage", data: { bodyType: "text", text: n.data.prompt ?? n.data.text ?? "", buttons } };
    }));
    // drop branch edges (a question has a single output regardless of buttons)
    setEdges((es) => es.filter((e) => e.source !== id || e.sourceHandle == null));
  }
  function removeNode(id: string) {
    if (nodesRef.current.find((n) => n.id === id)?.type === "trigger") return;
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSel((cur) => (cur === id ? null : cur));
  }
  function removeEdge(id: string) {
    setEdges((es) => es.filter((e) => e.id !== id));
    setSelEdge(null);
  }
  function removeButtonEdges(source: string, buttonId: string) {
    setEdges((es) => es.filter((e) => !(e.source === source && e.sourceHandle === buttonId)));
  }

  const variables = useMemo(() => {
    const set = new Set(knownVariables);
    nodes.forEach((n) => { if (n.type === "askQuestion" && n.data.variable) set.add(n.data.variable); });
    return [...set].filter(Boolean).sort();
  }, [nodes, knownVariables]);

  async function onSave(publish: boolean) {
    const graph: FlowGraph = { nodes: nodes as any, edges: edges as any };
    setMsg(null);
    startTransition(async () => {
      const res = publish ? await publishFlowAction(flowId, graph) : await saveFlowAction(flowId, graph);
      setMsg(res?.error ? { kind: "err", text: res.error } : { kind: "ok", text: res?.ok ?? "Saved" });
    });
  }

  const selectedNode = nodes.find((n) => n.id === sel) ?? null;
  const selectedEdge = edges.find((e) => e.id === selEdge) ?? null;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Top bar */}
      <header className="z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Link href="/dashboard/flows" className="grid h-9 w-9 place-items-center rounded-btn text-sub hover:bg-canvas">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{name}</div>
          <span className={`text-xs font-semibold ${status === "PUBLISHED" ? "text-brand" : "text-faint"}`}>
            {status === "PUBLISHED" ? "● Live" : "Draft"}
          </span>
        </div>
        {msg && <span className={`text-xs font-medium ${msg.kind === "ok" ? "text-emerald-600" : "text-rose"}`}>{msg.text}</span>}
        <button
          onClick={() => { const nd = dir === "vertical" ? "horizontal" : "vertical"; setDir(nd); autoArrange(nd); }}
          title="Switch layout direction"
          className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
        >
          {dir === "vertical" ? <MoveVertical className="h-4 w-4" /> : <MoveHorizontal className="h-4 w-4" />}
          {dir === "vertical" ? "Vertical" : "Horizontal"}
        </button>
        <button onClick={() => autoArrange()} title="Auto-arrange the layout" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
          <Wand2 className="h-4 w-4" /> Arrange
        </button>
        <button onClick={() => onSave(false)} disabled={pending} className="rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas disabled:opacity-60">Save</button>
        <button onClick={() => onSave(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Publish
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: steps palette (drag a block onto the canvas) */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-line bg-white p-3">
          <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wide text-faint">Steps</div>
          <div className="space-y-2">
            {PALETTE.map((k) => {
              const m = META[k]; const Icon = m.icon;
              return (
                <button
                  key={k}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    drag.current = { kind: "spawn", nodeKind: k, sx: e.clientX, sy: e.clientY, moved: false };
                    setGhost({ kind: k, x: e.clientX, y: e.clientY });
                  }}
                  style={{ touchAction: "none" }}
                  className="group flex w-full cursor-grab select-none items-center gap-3 rounded-card border border-line bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card active:cursor-grabbing [&_*]:pointer-events-none"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition group-hover:scale-105" style={{ background: `${m.color}1a`, color: m.color }}><Icon className="h-5 w-5" /></span>
                  <span className="text-sm font-semibold text-ink">{m.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 px-1 text-[10px] leading-relaxed text-faint">
            Drag a block onto the canvas to add it (or click to drop one in the center). Then drag a node's bottom dot onto another to connect.
          </p>
        </aside>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={wrapRef}
            onWheel={onWheel}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: tf.x, oy: tf.y };
              setSel(null); setSelEdge(null);
            }}
            className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
            style={{ backgroundImage: "radial-gradient(#d2dae3 1px, transparent 1px)", backgroundSize: `${20 * tf.s}px ${20 * tf.s}px`, backgroundPosition: `${tf.x}px ${tf.y}px` }}
          >
            <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})` }}>
              {/* edges */}
              <svg className="absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1, pointerEvents: "none" }}>
                {edges.map((e) => {
                  const a = handlePos(e.source, e.sourceHandle ?? "out");
                  const b = handlePos(e.target, "in");
                  const path = edgePath(a, b);
                  const active = selEdge === e.id;
                  return (
                    <g key={e.id} style={{ pointerEvents: "stroke" }}>
                      <path d={path} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: "pointer", pointerEvents: "stroke" }}
                        onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSel(null); }} />
                      <path d={path} fill="none" stroke={active ? "#e0698a" : "#9bb4c4"} strokeWidth={active ? 2.5 : 2} />
                    </g>
                  );
                })}
                {wire && (
                  <path d={edgePath({ x: wire.x1, y: wire.y1 }, { x: wire.x2, y: wire.y2 })} fill="none" stroke="#0e7490" strokeWidth={2} strokeDasharray="5 4" />
                )}
              </svg>

              {/* floating delete button on the selected wire */}
              {selectedEdge && (() => {
                const a = handlePos(selectedEdge.source, selectedEdge.sourceHandle ?? "out");
                const b = handlePos(selectedEdge.target, "in");
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                return (
                  <button
                    onPointerDown={(ev) => { ev.stopPropagation(); removeEdge(selectedEdge.id); }}
                    title="Delete connection"
                    className="absolute z-10 inline-flex items-center gap-1 rounded-pill border border-rose/30 bg-white px-2 py-1 text-[11px] font-bold text-rose shadow-card hover:bg-rose/10"
                    style={{ left: mx, top: my, transform: `translate(-50%,-50%) scale(${1 / tf.s})` }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                );
              })()}

              {/* nodes */}
              {nodes.map((n) => (
                <NodeCard
                  key={n.id}
                  node={n}
                  selected={sel === n.id}
                  dir={dir}
                  onMeasure={onMeasure}
                  onHandles={onHandles}
                  onSelect={() => { setSel(n.id); setSelEdge(null); }}
                  onDelete={() => removeNode(n.id)}
                  onDragStart={(e) => {
                    drag.current = { kind: "node", id: n.id, sx: e.clientX, sy: e.clientY, ox: n.position.x, oy: n.position.y };
                  }}
                  onWireStart={(handle, e) => {
                    e.stopPropagation();
                    drag.current = { kind: "wire", source: n.id, handle };
                    const from = handlePos(n.id, handle);
                    setWire({ x1: from.x, y1: from.y, x2: from.x, y2: from.y });
                  }}
                />
              ))}
            </div>
          </div>

          {/* zoom controls */}
          <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-btn border border-line bg-white p-1 shadow-card">
            <button onClick={() => setTf((t) => ({ ...t, s: clamp(t.s * 0.9, 0.4, 1.6) }))} className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-canvas"><Minus className="h-4 w-4" /></button>
            <span className="w-10 text-center text-xs font-semibold text-sub">{Math.round(tf.s * 100)}%</span>
            <button onClick={() => setTf((t) => ({ ...t, s: clamp(t.s * 1.1, 0.4, 1.6) }))} className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-canvas"><Plus className="h-4 w-4" /></button>
            <button onClick={() => setTf({ x: 60, y: 60, s: 1 })} title="Reset view" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-canvas"><Maximize2 className="h-4 w-4" /></button>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-pill bg-white/80 px-3 py-1 text-[11px] text-faint shadow-sm">
            <MousePointer2 className="h-3 w-3" /> Drag a node's dot to connect · drag canvas to pan · scroll to zoom
          </div>

          {/* Config panel — slides in from the right only when a node is selected */}
          <aside
            className={`absolute right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-line bg-white shadow-[-12px_0_28px_rgba(14,116,144,.07)] transition-transform duration-200 ease-out ${selectedNode ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
          >
            {selectedNode && (
              <div className="p-4">
                <Config
                  node={selectedNode}
                  variables={variables}
                  onChange={(p) => patch(selectedNode.id, p)}
                  onToggleQuestion={(on) => setIsQuestion(selectedNode.id, on)}
                  onDelete={() => removeNode(selectedNode.id)}
                  onClose={() => setSel(null)}
                  onRemoveButtonEdges={(bid) => removeButtonEdges(selectedNode.id, bid)}
                />
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* drag-ghost following the cursor while spawning from the palette */}
      {ghost && (() => {
        const m = META[ghost.kind]; const Icon = m.icon;
        return (
          <div className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-card border border-brand/40 bg-white px-3 py-2 shadow-card-lg" style={{ left: ghost.x, top: ghost.y }}>
            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><Icon className="h-4 w-4" /></span>
            <span className="text-sm font-bold text-ink">{m.label}</span>
          </div>
        );
      })()}
    </div>
  );
}

// ── node card ───────────────────────────────────────────────────────────────────
function NodeCard({
  node, selected, dir, onSelect, onMeasure, onHandles, onDragStart, onWireStart, onDelete,
}: {
  node: GNode; selected: boolean; dir: "vertical" | "horizontal"; onSelect: () => void;
  onMeasure: (id: string, h: number) => void;
  onHandles: (id: string, map: Record<string, { x: number; y: number }>) => void;
  onDragStart: (e: React.PointerEvent) => void;
  onWireStart: (handle: string, e: React.PointerEvent) => void;
  onDelete: () => void;
}) {
  const m = META[node.type]; const Icon = m.icon;
  const ref = useRef<HTMLDivElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});
  const outs = outputs(node);
  const btnMode = isButtonsMsg(node);
  const horiz = dir === "horizontal";
  els.current = {};

  // Measure each handle's true centre (offset from the card, unscaled) so edges
  // land exactly on the dots in any layout / orientation.
  useLayoutEffect(() => {
    const card = ref.current; if (!card) return;
    onMeasure(node.id, card.offsetHeight);
    const cr = card.getBoundingClientRect();
    const scale = cr.width / (card.offsetWidth || 1) || 1;
    const map: Record<string, { x: number; y: number }> = {};
    for (const k in els.current) {
      const el = els.current[k]; if (!el) continue;
      const r = el.getBoundingClientRect();
      map[k] = { x: (r.left + r.width / 2 - cr.left) / scale, y: (r.top + r.height / 2 - cr.top) / scale };
    }
    onHandles(node.id, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, node.type, node.data]);

  const dot = (handleId: string, extra: string) => (
    <span
      ref={(el) => { els.current[handleId] = el; }}
      onPointerDown={(e) => onWireStart(handleId, e)}
      title="Drag to connect"
      className={`absolute h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-white bg-brand shadow-[0_0_0_1px_rgba(14,116,144,.4)] hover:scale-125 ${extra}`}
    />
  );

  return (
    <div
      ref={ref}
      data-nodeid={node.id}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); onDragStart(e); }}
      className={`group absolute select-none rounded-card border bg-white shadow-card transition-shadow ${selected ? "border-brand ring-2 ring-brand/25" : "border-line hover:border-brand/40"}`}
      style={{ left: node.position.x, top: node.position.y, width: NODE_W, cursor: "grab" }}
    >
      {/* input handle — top (vertical) or left (horizontal) */}
      {hasInput(node) && (
        <span
          ref={(el) => { els.current["in"] = el; }}
          className={`absolute h-3 w-3 rounded-full border-2 border-white bg-[#9bb4c4] ${horiz ? "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" : "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"}`}
        />
      )}

      <div className="flex items-center gap-2.5 px-3 pt-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{m.label}</span>
      </div>
      <div className={`px-3 pt-1.5 pl-[50px] text-xs text-sub ${btnMode ? "pb-2" : "pb-3"}`}>
        <span className="line-clamp-2 break-words">{summary(node)}</span>
      </div>

      {/* reply buttons in the card, each with its own connect dot */}
      {btnMode && (
        <div className={`gap-1.5 px-3 pb-3 ${horiz ? "flex flex-col" : "flex"}`}>
          {node.data.buttons.map((b: any) => (
            <div key={b.id} className={`relative truncate rounded-pill border border-brand/20 bg-brand-soft px-2 py-1 text-center text-[11px] font-semibold text-brand ${horiz ? "pr-3.5" : "min-w-0 flex-1"}`}>
              {b.label || "Button"}
              {dot(b.id, horiz ? "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" : "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2")}
            </div>
          ))}
        </div>
      )}

      {/* hover delete — not for the trigger */}
      {node.type !== "trigger" && (
        <button
          onPointerDown={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete node"
          className={`absolute right-1.5 grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 transition hover:bg-rose/10 hover:text-rose group-hover:opacity-100 ${btnMode ? "top-1.5" : "bottom-1.5"}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* non-button outputs — bottom (vertical) or right (horizontal) */}
      {!btnMode && outs.map((o, i) => {
        const n = outs.length;
        const style = horiz
          ? { left: "100%", top: `${((i + 1) / (n + 1)) * 100}%` }
          : { left: outHandleX(node, i, n), top: "100%" };
        return (
          <span key={o.id} className="absolute" style={style as React.CSSProperties}>
            {dot(o.id, "-translate-x-1/2 -translate-y-1/2")}
            {o.label && (
              <span
                className={`absolute whitespace-nowrap rounded-pill bg-white px-1.5 text-[9px] font-bold uppercase tracking-wide ${horiz ? "left-2.5 top-1/2 -translate-y-1/2" : "left-1/2 top-2 -translate-x-1/2"}`}
                style={{ color: o.id === "no" ? "#e0698a" : o.id === "yes" ? "#34c08a" : "#0e7490" }}
              >
                {o.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── config panel ─────────────────────────────────────────────────────────────────
const inp = "mt-1 w-full rounded-btn border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const lbl = "block text-xs font-semibold text-ink";

function Config({
  node, variables, onChange, onToggleQuestion, onDelete, onClose, onRemoveButtonEdges,
}: {
  node: GNode; variables: string[]; onChange: (p: any) => void;
  onToggleQuestion: (on: boolean) => void;
  onDelete: () => void; onClose: () => void;
  onRemoveButtonEdges: (buttonId: string) => void;
}) {
  const d = node.data; const m = META[node.type];
  const isMessage = node.type === "sendMessage" || node.type === "askQuestion";
  const isQuestion = node.type === "askQuestion";

  function setButton(i: number, label: string) {
    const buttons = [...(d.buttons ?? [])];
    buttons[i] = { ...buttons[i], label: label.slice(0, 20) };
    onChange({ buttons });
  }
  function addButton() {
    const buttons = [...(d.buttons ?? [])];
    if (buttons.length >= 3) return;
    buttons.push({ id: "b_" + uid(), label: `Option ${buttons.length + 1}` });
    onChange({ buttons });
  }
  function removeButton(i: number) {
    const b = (d.buttons ?? [])[i];
    if (b) onRemoveButtonEdges(b.id);
    onChange({ buttons: (d.buttons ?? []).filter((_: any, x: number) => x !== i) });
  }

  const buttonsBlock = (label: string, hint: string) => (
    <div>
      <label className={lbl}>{label}</label>
      <div className="mt-1 space-y-2">
        {(d.buttons ?? []).map((b: any, i: number) => (
          <div key={b.id} className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-[10px] font-bold text-brand">{i + 1}</span>
            <input className="flex-1 rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand" value={b.label} maxLength={20} onChange={(e) => setButton(i, e.target.value)} placeholder="Button text" />
            <button onClick={() => removeButton(i)} className="text-faint hover:text-rose"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {(d.buttons ?? []).length < 3 && (
        <button onClick={addButton} className="mt-2 inline-flex items-center gap-1.5 rounded-btn border border-dashed border-line px-2.5 py-1.5 text-xs font-semibold text-sub hover:bg-canvas">
          <Plus className="h-3.5 w-3.5" /> Add button
        </button>
      )}
      <p className="mt-1.5 text-[10px] text-faint">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}><m.icon className="h-4 w-4" /></span>
        <h2 className="flex-1 text-sm font-bold text-ink">{m.label}</h2>
        <button onClick={onClose} title="Close" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-canvas"><X className="h-4 w-4" /></button>
      </div>

      {node.type === "trigger" && (
        <>
          <div>
            <label className={lbl}>Start the flow on</label>
            <select className={inp} value={d.mode} onChange={(e) => onChange({ mode: e.target.value })}>
              <option value="keyword">a keyword</option>
              <option value="anyMessage">any message</option>
            </select>
          </div>
          {d.mode === "keyword" && (
            <div>
              <label className={lbl}>Keywords (comma-separated)</label>
              <input className={inp} value={(d.keywords ?? []).join(", ")} onChange={(e) => onChange({ keywords: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="hi, hello, start" />
            </div>
          )}
        </>
      )}

      {isMessage && (
        <>
          <div>
            <label className={lbl}>Message</label>
            <textarea className={inp} rows={3}
              value={isQuestion ? d.prompt : d.text}
              onChange={(e) => onChange(isQuestion ? { prompt: e.target.value } : { text: e.target.value })} />
          </div>

          {/* the toggle that turns a message into a question */}
          <label className="flex items-start gap-2.5 rounded-card border border-line bg-canvas/60 p-2.5">
            <input type="checkbox" checked={isQuestion} onChange={(e) => onToggleQuestion(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
            <span>
              <span className="block text-xs font-bold text-ink">Wait for a reply</span>
              <span className="block text-[11px] text-faint">Pause the flow, save the customer's answer to a variable.</span>
            </span>
          </label>

          {isQuestion ? (
            <>
              <div>
                <label className={lbl}>Save answer to variable</label>
                <input className={inp} list="cl-vars" value={d.variable} onChange={(e) => onChange({ variable: e.target.value.replace(/\s+/g, "_") })} placeholder="name" />
                <datalist id="cl-vars">{variables.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
              <div>
                <label className={lbl}>Validation</label>
                <select className={inp} value={d.validation} onChange={(e) => onChange({ validation: e.target.value })}>
                  <option value="none">None</option><option value="email">Email</option><option value="number">Number</option><option value="phone">Phone</option>
                </select>
              </div>
              {buttonsBlock("Quick-reply buttons (optional, max 3)", "Tapping a button fills the answer — handy for fixed choices. The customer can still type instead.")}
            </>
          ) : (
            <>
              <div>
                <label className={lbl}>Format</label>
                <select className={inp} value={d.bodyType} onChange={(e) => {
                  const bt = e.target.value;
                  if (bt !== "buttons") (d.buttons ?? []).forEach((b: any) => onRemoveButtonEdges(b.id));
                  onChange({ bodyType: bt, ...(bt === "buttons" && (d.buttons ?? []).length === 0 ? { buttons: [{ id: "b_" + uid(), label: "Yes" }, { id: "b_" + uid(), label: "No" }] } : {}), ...(bt !== "buttons" ? { buttons: [] } : {}) });
                }}>
                  <option value="text">Text</option>
                  <option value="buttons">Buttons</option>
                  <option value="image">Image</option>
                  <option value="document">Document</option>
                  <option value="video">Video</option>
                </select>
              </div>
              {["image", "document", "video"].includes(d.bodyType) && (
                <div><label className={lbl}>Media URL</label><input className={inp} value={d.mediaUrl ?? ""} onChange={(e) => onChange({ mediaUrl: e.target.value || undefined })} placeholder="https://…" /></div>
              )}
              {d.bodyType === "buttons" && buttonsBlock(
                "Reply buttons (max 3)",
                "Each button is an output on the node — drag its dot to where the flow should go when tapped.",
              )}
            </>
          )}
          <p className="text-[10px] text-faint">Use {"{{variable}}"} to insert collected answers.</p>
        </>
      )}

      {node.type === "condition" && (
        <>
          <p className="text-xs text-sub">Branch the flow on a collected value. Wire the <strong>yes</strong> / <strong>no</strong> outputs.</p>
          <div><label className={lbl}>Variable</label><input className={inp} value={d.rules?.[0]?.variable ?? ""} onChange={(e) => onChange({ rules: [{ ...d.rules[0], variable: e.target.value, targetHandle: "yes" }], defaultHandle: "no" })} /></div>
          <div><label className={lbl}>Operator</label>
            <select className={inp} value={d.rules?.[0]?.op ?? "contains"} onChange={(e) => onChange({ rules: [{ ...d.rules[0], op: e.target.value, targetHandle: "yes" }], defaultHandle: "no" })}>
              {["eq", "neq", "contains", "gt", "lt", "exists", "notExists"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Value</label><input className={inp} value={d.rules?.[0]?.value ?? ""} onChange={(e) => onChange({ rules: [{ ...d.rules[0], value: e.target.value, targetHandle: "yes" }], defaultHandle: "no" })} /></div>
        </>
      )}

      {node.type === "setAttribute" && (
        <>
          <div><label className={lbl}>Attribute</label><input className={inp} value={d.attribute} onChange={(e) => onChange({ attribute: e.target.value })} /></div>
          <div><label className={lbl}>Value</label><input className={inp} value={d.value} onChange={(e) => onChange({ value: e.target.value })} /></div>
        </>
      )}

      {node.type === "addTag" && (
        <div><label className={lbl}>Tags (comma-separated)</label><input className={inp} value={(d.tags ?? []).join(", ")} onChange={(e) => onChange({ tags: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} /></div>
      )}

      {node.type === "aiReply" && (
        <>
          <div><label className={lbl}>System prompt</label><textarea className={inp} rows={3} value={d.systemPrompt} onChange={(e) => onChange({ systemPrompt: e.target.value })} /></div>
          <div><label className={lbl}>Knowledge (optional)</label><textarea className={inp} rows={3} value={d.knowledge} onChange={(e) => onChange({ knowledge: e.target.value })} /></div>
        </>
      )}

      {node.type === "assignAgent" && (
        <div><label className={lbl}>Note for the agent</label><input className={inp} value={d.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} /></div>
      )}

      {node.type === "delay" && (
        <div><label className={lbl}>Wait (seconds)</label><input type="number" className={inp} value={d.seconds} onChange={(e) => onChange({ seconds: Math.max(1, parseInt(e.target.value || "1", 10)) })} /></div>
      )}

      {node.type === "end" && <p className="text-xs text-sub">Stops the conversation flow.</p>}

      {node.type !== "trigger" && (
        <button onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-btn bg-rose/10 px-3 py-2 text-sm font-semibold text-rose hover:bg-rose/15">
          <Trash2 className="h-4 w-4" /> Delete node
        </button>
      )}
    </div>
  );
}

// ── ensure a trigger exists + coerce shapes ─────────────────────────────────────
function normalizeGraph(g: FlowGraph): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = (g.nodes as any[]).map((n) => ({
    id: n.id, type: n.type, position: n.position ?? { x: 0, y: 0 }, data: n.data ?? {},
  }));
  if (!nodes.some((n) => n.type === "trigger")) {
    nodes.unshift({ id: "trigger", type: "trigger", position: { x: 80, y: 60 }, data: defaultData("trigger") });
  }
  const edges: GEdge[] = (g.edges as any[]).map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null,
  }));
  return { nodes, edges };
}
