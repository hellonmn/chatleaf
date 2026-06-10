"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Plus, Trash2, Link2, MessageSquare, Loader2, Send } from "lucide-react";
import { createTemplateAction, type ActionState } from "@/lib/actions/templates";

type Btn = { type: "QUICK_REPLY" | "URL"; text: string; url: string };

const LANGS = [
  ["en_US", "English (US)"], ["en_GB", "English (UK)"], ["hi", "Hindi"],
  ["es_ES", "Spanish"], ["pt_BR", "Portuguese (BR)"], ["ar", "Arabic"],
  ["fr", "French"], ["id", "Indonesian"],
] as const;

const inp = "mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const lbl = "block text-xs font-semibold text-ink";

/** Highlight {{n}} placeholders in a preview string. */
function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{\{\d+\}\})/g).map((p, i) =>
        /^\{\{\d+\}\}$/.test(p) ? (
          <span key={i} className="rounded bg-brand-soft px-1 font-semibold text-brand">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for review
    </button>
  );
}

export function TemplateForm({ hasAccount }: { hasAccount: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createTemplateAction, undefined);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("en_US");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("Hi {{1}}, thanks for choosing Chatleaf! 🌿");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<Btn[]>([]);

  const addButton = () => setButtons((b) => (b.length >= 3 ? b : [...b, { type: "QUICK_REPLY", text: "", url: "" }]));
  const setButton = (i: number, patch: Partial<Btn>) => setButtons((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeButton = (i: number) => setButtons((b) => b.filter((_, j) => j !== i));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/templates" className="grid h-9 w-9 place-items-center rounded-btn text-sub hover:bg-canvas"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-xl font-bold text-ink">New template</h1>
          <p className="text-sm text-sub">Build it here and submit straight to Meta for approval.</p>
        </div>
      </div>

      {!hasAccount && (
        <div className="rounded-card bg-warm/15 px-4 py-3 text-sm text-[#c47a2e]">
          Connect a WhatsApp number in <Link href="/dashboard/settings/whatsapp" className="font-semibold underline">Channels</Link> before submitting templates.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Form */}
        <form action={action} className="space-y-4 rounded-card border border-line bg-white p-5 shadow-card">
          <input type="hidden" name="buttons" value={JSON.stringify(buttons.map((b) => (b.type === "URL" ? { type: "URL", text: b.text, url: b.url } : { type: "QUICK_REPLY", text: b.text })))} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>Template name</label>
              <input name="name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_"))} className={inp} placeholder="order_confirmation" />
              <p className="mt-1 text-[10px] text-faint">Lowercase letters, numbers and underscores only.</p>
            </div>
            <div>
              <label className={lbl}>Language</label>
              <select name="language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inp}>
                {LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>Category</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["MARKETING", "UTILITY"] as const).map((c) => (
                <button type="button" key={c} onClick={() => setCategory(c)} className={`rounded-btn border px-3 py-2 text-sm font-semibold transition ${category === c ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-sub hover:bg-canvas"}`}>
                  {c === "MARKETING" ? "Marketing" : "Utility"}
                </button>
              ))}
            </div>
            <input type="hidden" name="category" value={category} />
          </div>

          <div>
            <label className={lbl}>Header (optional)</label>
            <input name="header" value={header} onChange={(e) => setHeader(e.target.value)} maxLength={60} className={inp} placeholder="A short bold heading" />
          </div>

          <div>
            <label className={lbl}>Body</label>
            <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1024} className={inp} />
            <p className="mt-1 text-[10px] text-faint">Use {"{{1}}"}, {"{{2}}"}… for variables — we fill sample values for Meta automatically.</p>
          </div>

          <div>
            <label className={lbl}>Footer (optional)</label>
            <input name="footer" value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} className={inp} placeholder="Reply STOP to opt out" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={lbl}>Buttons (optional, max 3)</label>
              {buttons.length < 3 && (
                <button type="button" onClick={addButton} className="inline-flex items-center gap-1 rounded-btn border border-dashed border-line px-2 py-1 text-xs font-semibold text-sub hover:bg-canvas"><Plus className="h-3.5 w-3.5" /> Add button</button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="rounded-card border border-line p-2.5">
                  <div className="flex items-center gap-2">
                    <select value={b.type} onChange={(e) => setButton(i, { type: e.target.value as Btn["type"] })} className="rounded-btn border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand">
                      <option value="QUICK_REPLY">Quick reply</option>
                      <option value="URL">Visit URL</option>
                    </select>
                    <input value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} maxLength={25} placeholder="Button text" className="flex-1 rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand" />
                    <button type="button" onClick={() => removeButton(i)} className="text-faint hover:text-rose"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {b.type === "URL" && (
                    <input value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://…" className="mt-2 w-full rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Link href="/dashboard/templates" className="rounded-btn border border-line px-3 py-2 text-sm font-semibold text-sub hover:bg-canvas">Cancel</Link>
            <SubmitButton />
          </div>
        </form>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="text-[11px] font-bold uppercase tracking-wide text-faint">Preview</div>
          <div className="mt-2 rounded-card border border-line p-4" style={{ backgroundColor: "#e6ddd3", backgroundImage: "radial-gradient(#d8cdbf 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
            <div className="ml-auto max-w-[260px] rounded-2xl rounded-tr-sm bg-white p-3 text-sm shadow-sm">
              {header && <div className="mb-1 font-bold text-ink"><Highlighted text={header} /></div>}
              <div className="whitespace-pre-wrap break-words text-ink"><Highlighted text={body || "Your message…"} /></div>
              {footer && <div className="mt-1.5 text-[11px] text-faint"><Highlighted text={footer} /></div>}
              <div className="mt-1 text-right text-[10px] text-faint">10:24 ✓✓</div>
            </div>
            {buttons.length > 0 && (
              <div className="ml-auto mt-1 max-w-[260px] space-y-1">
                {buttons.map((b, i) => (
                  <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-semibold text-brand shadow-sm">
                    {b.type === "URL" ? <Link2 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                    {b.text || (b.type === "URL" ? "Visit" : "Quick reply")}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Meta usually reviews templates within a few minutes to a few hours. It'll show as <strong>pending</strong> here, then <strong>approved</strong> after a Sync.
          </p>
        </div>
      </div>
    </div>
  );
}
