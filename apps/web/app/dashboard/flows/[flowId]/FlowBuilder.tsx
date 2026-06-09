"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft } from "lucide-react";
import type { FlowGraph } from "@watool/types";
import { saveFlowAction, publishFlowAction } from "@/lib/actions/flows";

type NodeKind =
  | "trigger"
  | "sendMessage"
  | "askQuestion"
  | "condition"
  | "setAttribute"
  | "addTag"
  | "aiReply"
  | "assignAgent"
  | "end";

const NODE_META: Record<
  NodeKind,
  { label: string; color: string; hasTarget: boolean; sources: (string | null)[] }
> = {
  trigger: { label: "Trigger", color: "#16a34a", hasTarget: false, sources: [null] },
  sendMessage: { label: "Send message", color: "#2563eb", hasTarget: true, sources: [null] },
  askQuestion: { label: "Ask question", color: "#7c3aed", hasTarget: true, sources: [null] },
  condition: { label: "Condition", color: "#d97706", hasTarget: true, sources: ["true", "false"] },
  setAttribute: { label: "Set attribute", color: "#0891b2", hasTarget: true, sources: [null] },
  addTag: { label: "Add tag", color: "#0d9488", hasTarget: true, sources: [null] },
  aiReply: { label: "AI reply", color: "#9333ea", hasTarget: true, sources: [null] },
  assignAgent: { label: "Assign to agent", color: "#dc2626", hasTarget: true, sources: [null] },
  end: { label: "End", color: "#64748b", hasTarget: true, sources: [] },
};

const PALETTE: NodeKind[] = [
  "sendMessage",
  "askQuestion",
  "condition",
  "setAttribute",
  "addTag",
  "aiReply",
  "assignAgent",
  "end",
];

function defaultData(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "trigger":
      return { mode: "keyword", keywords: [], matchType: "contains" };
    case "sendMessage":
      return { bodyType: "text", text: "Hello!", buttons: [] };
    case "askQuestion":
      return { prompt: "What's your question?", variable: "answer", validation: "none" };
    case "condition":
      return {
        rules: [{ variable: "answer", op: "contains", value: "", targetHandle: "true" }],
        defaultHandle: "false",
      };
    case "setAttribute":
      return { attribute: "key", value: "value" };
    case "addTag":
      return { tags: ["tag"] };
    case "aiReply":
      return {
        systemPrompt: "You are a helpful WhatsApp support assistant. Reply concisely.",
        knowledge: "",
        model: "",
        maxTokens: 512,
        saveToVariable: "",
      };
    case "assignAgent":
      return { team: null };
    case "end":
      return {};
  }
}

function summary(kind: NodeKind, data: any): string {
  switch (kind) {
    case "trigger":
      return data.mode === "anyMessage" ? "any message" : `keywords: ${(data.keywords ?? []).join(", ") || "—"}`;
    case "sendMessage":
      return data.text || "—";
    case "askQuestion":
      return `${data.prompt} → {{${data.variable}}}`;
    case "condition":
      return `${data.rules?.[0]?.variable} ${data.rules?.[0]?.op} ${data.rules?.[0]?.value ?? ""}`;
    case "setAttribute":
      return `${data.attribute} = ${data.value}`;
    case "addTag":
      return (data.tags ?? []).join(", ");
    case "aiReply":
      return "AI answers using Claude";
    case "assignAgent":
      return "hand off to a human";
    case "end":
      return "stop";
  }
}

/** One custom node component, styled by its kind. */
function WNode({ type, data, selected }: NodeProps) {
  const kind = type as NodeKind;
  const meta = NODE_META[kind];
  return (
    <div
      className="w-52 rounded-lg border bg-white text-xs shadow-sm"
      style={{ borderColor: selected ? meta.color : "#e2e8f0", borderTopWidth: 3, borderTopColor: meta.color }}
    >
      {meta.hasTarget && <Handle type="target" position={Position.Top} />}
      <div className="px-3 py-1.5 font-semibold" style={{ color: meta.color }}>
        {meta.label}
      </div>
      <div className="truncate px-3 pb-2 text-slate-500">{summary(kind, data)}</div>
      {meta.sources.map((s, i) => {
        const count = meta.sources.length;
        const left = count === 1 ? 0.5 : (i + 1) / (count + 1);
        return (
          <Handle
            key={s ?? "out"}
            id={s ?? undefined}
            type="source"
            position={Position.Bottom}
            style={{ left: `${left * 100}%` }}
          />
        );
      })}
      {meta.sources.length > 1 && (
        <div className="flex justify-around px-2 pb-1 text-[9px] text-slate-400">
          {meta.sources.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function InnerBuilder({
  flowId,
  name,
  status,
  initialGraph,
  knownVariables,
}: {
  flowId: string;
  name: string;
  status: string;
  initialGraph: FlowGraph;
  knownVariables: string[];
}) {
  const nodeTypes = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(NODE_META).map((k) => [k, WNode]),
      ) as Record<string, typeof WNode>,
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialGraph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialGraph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Variables (contact custom fields) available to Ask-question nodes. Seeded
  // from known org variables + those already used in this flow; growing as the
  // user types new ones.
  const [variables, setVariables] = useState<string[]>(() => {
    const set = new Set(knownVariables);
    initialGraph.nodes.forEach((n) => {
      if (n.type === "askQuestion") set.add((n.data as any).variable);
    });
    return [...set].filter(Boolean).sort();
  });
  const addVariable = (v: string) => {
    const name = v.trim();
    if (name && !variables.includes(name)) {
      setVariables((prev) => [...prev, name].sort());
    }
  };

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const addNode = (kind: NodeKind) => {
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: kind,
        position: { x: 120 + Math.round((nds.length % 4) * 40), y: 120 + nds.length * 30 },
        data: defaultData(kind),
      },
    ]);
  };

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const updateData = (patch: Record<string, unknown>) => {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    setNodes((nds) => nds.filter((n) => n.id !== selected.id));
    setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelectedId(null);
  };

  const toGraph = (): FlowGraph => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeKind,
      position: n.position,
      data: n.data,
    })) as FlowGraph["nodes"],
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  });

  const onSave = () =>
    startTransition(async () => {
      const res = await saveFlowAction(flowId, toGraph());
      setMsg(res?.error ? { kind: "err", text: res.error } : { kind: "ok", text: res?.ok ?? "Saved." });
    });

  const onPublish = () =>
    startTransition(async () => {
      const res = await publishFlowAction(flowId, toGraph());
      setMsg(res?.error ? { kind: "err", text: res.error } : { kind: "ok", text: res?.ok ?? "Published." });
    });

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <a href="/dashboard/flows" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <h1 className="text-base font-semibold text-slate-900">{name}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {status.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {msg.text}
            </span>
          )}
          <button
            onClick={onSave}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Save draft
          </button>
          <button
            onClick={onPublish}
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Publish
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Palette */}
        <div className="w-40 shrink-0 space-y-1.5 overflow-y-auto border-r border-slate-200 p-2">
          <div className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Add node
          </div>
          {PALETTE.map((k) => (
            <button
              key={k}
              onClick={() => addNode(k)}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: NODE_META[k].color }} />
              {NODE_META[k].label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable className="!bg-slate-50" />
          </ReactFlow>
        </div>

        {/* Config panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 p-3">
          {!selected ? (
            <p className="text-xs text-slate-400">
              Select a node to configure it, or add one from the left. Connect
              nodes by dragging from the dots.
            </p>
          ) : (
            <ConfigPanel
              kind={selected.type as NodeKind}
              data={selected.data as any}
              onChange={updateData}
              onDelete={selected.type === "trigger" ? undefined : deleteSelected}
              variables={variables}
              onAddVariable={addVariable}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const inp =
  "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const lbl = "block text-[11px] font-medium text-slate-600";

function ConfigPanel({
  kind,
  data,
  onChange,
  onDelete,
  variables,
  onAddVariable,
}: {
  kind: NodeKind;
  data: any;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  variables: string[];
  onAddVariable: (name: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: NODE_META[kind].color }}>
          {NODE_META[kind].label}
        </h3>
        {onDelete && (
          <button onClick={onDelete} className="text-xs text-red-600 hover:underline">
            Delete
          </button>
        )}
      </div>

      {kind === "trigger" && (
        <>
          <div>
            <label className={lbl}>Start when</label>
            <select className={inp} value={data.mode} onChange={(e) => onChange({ mode: e.target.value })}>
              <option value="keyword">A keyword is sent</option>
              <option value="anyMessage">Any message is received</option>
            </select>
          </div>
          {data.mode === "keyword" && (
            <>
              <div>
                <label className={lbl}>Keywords (comma-separated)</label>
                <input
                  className={inp}
                  defaultValue={(data.keywords ?? []).join(", ")}
                  onBlur={(e) =>
                    onChange({
                      keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div>
                <label className={lbl}>Match</label>
                <select className={inp} value={data.matchType} onChange={(e) => onChange({ matchType: e.target.value })}>
                  <option value="contains">contains</option>
                  <option value="exact">exact</option>
                </select>
              </div>
            </>
          )}
        </>
      )}

      {kind === "sendMessage" && (
        <>
          <div>
            <label className={lbl}>Message type</label>
            <select
              className={inp}
              value={["image", "document", "video"].includes(data.bodyType) ? data.bodyType : "text"}
              onChange={(e) => onChange({ bodyType: e.target.value })}
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="document">Document</option>
              <option value="video">Video</option>
            </select>
          </div>
          {["image", "document", "video"].includes(data.bodyType) && (
            <div>
              <label className={lbl}>Media URL (public link)</label>
              <input
                className={inp}
                placeholder="https://example.com/file.jpg"
                value={data.mediaUrl ?? ""}
                onChange={(e) => onChange({ mediaUrl: e.target.value || undefined })}
              />
              <p className="text-[10px] text-slate-400">
                A public HTTPS URL Meta can fetch (no auth).
              </p>
            </div>
          )}
          <div>
            <label className={lbl}>
              {["image", "document", "video"].includes(data.bodyType)
                ? "Caption (optional)"
                : "Message text"}
            </label>
            <textarea
              className={inp}
              rows={4}
              value={data.text}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </div>
          <p className="text-[10px] text-slate-400">Use {"{{variable}}"} to insert collected answers.</p>
        </>
      )}

      {kind === "askQuestion" && (
        <>
          <div>
            <label className={lbl}>Prompt</label>
            <textarea className={inp} rows={3} value={data.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Save answer to variable</label>
            <input
              className={inp}
              list="watool-variables"
              placeholder="pick existing or type a new name"
              value={data.variable}
              onChange={(e) => onChange({ variable: e.target.value.replace(/\s+/g, "_") })}
              onBlur={(e) => onAddVariable(e.target.value)}
            />
            <datalist id="watool-variables">
              {variables.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-slate-400">
              Pick a variable or type a new one to create it. The answer is saved
              to the contact and reusable as{" "}
              <code>{`{{${data.variable || "variable"}}}`}</code>.
            </p>
          </div>
          <div>
            <label className={lbl}>Validation</label>
            <select className={inp} value={data.validation} onChange={(e) => onChange({ validation: e.target.value })}>
              <option value="none">none</option>
              <option value="email">email</option>
              <option value="number">number</option>
              <option value="phone">phone</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Retry message (on invalid)</label>
            <input className={inp} value={data.retryMessage ?? ""} onChange={(e) => onChange({ retryMessage: e.target.value })} />
          </div>
        </>
      )}

      {kind === "condition" && (
        <>
          <p className="text-[10px] text-slate-400">
            Routes to <b>true</b> when the rule matches, else <b>false</b>.
          </p>
          <div>
            <label className={lbl}>Variable</label>
            <input
              className={inp}
              value={data.rules?.[0]?.variable ?? ""}
              onChange={(e) => onChange({ rules: [{ ...data.rules[0], variable: e.target.value }] })}
            />
          </div>
          <div>
            <label className={lbl}>Operator</label>
            <select
              className={inp}
              value={data.rules?.[0]?.op ?? "contains"}
              onChange={(e) => onChange({ rules: [{ ...data.rules[0], op: e.target.value }] })}
            >
              {["eq", "neq", "contains", "gt", "lt", "exists", "notExists"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Value</label>
            <input
              className={inp}
              value={data.rules?.[0]?.value ?? ""}
              onChange={(e) => onChange({ rules: [{ ...data.rules[0], value: e.target.value }] })}
            />
          </div>
        </>
      )}

      {kind === "setAttribute" && (
        <>
          <div>
            <label className={lbl}>Attribute name</label>
            <input className={inp} value={data.attribute} onChange={(e) => onChange({ attribute: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Value</label>
            <input className={inp} value={data.value} onChange={(e) => onChange({ value: e.target.value })} />
          </div>
        </>
      )}

      {kind === "addTag" && (
        <div>
          <label className={lbl}>Tags (comma-separated)</label>
          <input
            className={inp}
            defaultValue={(data.tags ?? []).join(", ")}
            onBlur={(e) => onChange({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      )}

      {kind === "aiReply" && (
        <div className="space-y-2">
          <div>
            <label className={lbl}>Instructions (system prompt)</label>
            <textarea
              className={inp}
              rows={3}
              value={data.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
            />
          </div>
          <div>
            <label className={lbl}>Knowledge base (optional)</label>
            <textarea
              className={inp}
              rows={4}
              placeholder="Paste FAQs / product info the AI may answer from…"
              value={data.knowledge ?? ""}
              onChange={(e) => onChange({ knowledge: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Model (optional)</label>
              <select
                className={inp}
                value={data.model ?? ""}
                onChange={(e) => onChange({ model: e.target.value })}
              >
                <option value="">Default (Opus 4.8)</option>
                <option value="claude-opus-4-8">Opus 4.8 — most capable</option>
                <option value="claude-sonnet-4-6">Sonnet 4.6 — balanced</option>
                <option value="claude-haiku-4-5">Haiku 4.5 — fast/cheap</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Max length</label>
              <input
                type="number"
                className={inp}
                value={data.maxTokens ?? 512}
                onChange={(e) => onChange({ maxTokens: Number(e.target.value) || 512 })}
              />
            </div>
          </div>
          <div>
            <label className={lbl}>Save answer to variable (optional)</label>
            <input
              className={inp}
              list="watool-variables"
              placeholder="e.g. ai_answer"
              value={data.saveToVariable ?? ""}
              onChange={(e) => onChange({ saveToVariable: e.target.value.replace(/\s+/g, "_") })}
              onBlur={(e) => onAddVariable(e.target.value)}
            />
          </div>
          <p className="text-[10px] text-slate-400">
            Claude answers using the conversation + knowledge base. Requires
            <code className="mx-1">ANTHROPIC_API_KEY</code> on the server.
          </p>
        </div>
      )}

      {kind === "assignAgent" && (
        <p className="text-xs text-slate-500">
          Hands the conversation to the human inbox and stops the bot.
        </p>
      )}

      {kind === "end" && <p className="text-xs text-slate-500">Ends the flow.</p>}
    </div>
  );
}

export function FlowBuilder(props: {
  flowId: string;
  name: string;
  status: string;
  initialGraph: FlowGraph;
  knownVariables: string[];
}) {
  return (
    <ReactFlowProvider>
      <InnerBuilder {...props} />
    </ReactFlowProvider>
  );
}
