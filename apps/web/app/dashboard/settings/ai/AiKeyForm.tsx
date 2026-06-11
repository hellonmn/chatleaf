"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles, Check, Loader2, ExternalLink } from "lucide-react";
import { saveAiKeyAction, type SettingsState } from "@/lib/actions/settings";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] hover:bg-brand-dark disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save key
    </button>
  );
}

export function AiKeyForm({ hasKey, envFallback }: { hasKey: boolean; envFallback: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveAiKeyAction, undefined);
  const [value, setValue] = useState("");

  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#efeafb] text-violet"><Sparkles className="h-4 w-4" /></span>
        <h2 className="text-sm font-bold text-ink">Claude API key</h2>
        {hasKey ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><Check className="h-3 w-3" /> Configured</span>
        ) : envFallback ? (
          <span className="ml-auto rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-bold text-sub">Using server key</span>
        ) : (
          <span className="ml-auto rounded-pill bg-warm/15 px-2 py-0.5 text-[11px] font-bold text-[#c47a2e]">Not set</span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-sub">
        Powers <strong>Suggest a reply</strong> in the inbox and the <strong>AI reply</strong> flow node. Get a key from the{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand hover:underline">Anthropic Console <ExternalLink className="h-3 w-3" /></a>. It's stored encrypted and never shown again.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <input
          type="password"
          name="apiKey"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          placeholder={hasKey ? "•••••••••• (leave blank to keep, clear to remove)" : "sk-ant-…"}
          className="w-full rounded-btn border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-faint">Submitting an empty field removes the saved key.</span>
          <SaveButton />
        </div>
      </form>
    </div>
  );
}
