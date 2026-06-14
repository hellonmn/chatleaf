"use client";

import { useActionState } from "react";
import {
  savePlatformSettingsAction,
  type PlatformSettingsState,
} from "@/lib/actions/admin";
import type { PlatformSettings } from "@/lib/platform-settings";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

const FLAGS: { key: keyof PlatformSettings; label: string; desc: string }[] = [
  { key: "signupsEnabled", label: "Public signups", desc: "Allow new workspaces to register." },
  { key: "broadcastsEnabled", label: "Broadcasts", desc: "Bulk campaigns for all orgs." },
  { key: "flowsEnabled", label: "Automations / flows", desc: "The no-code chatbot builder." },
  { key: "templatesEnabled", label: "Message templates", desc: "Template create + sync." },
  { key: "aiEnabled", label: "AI assistant", desc: "Claude reply suggestions + AI node." },
];

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, action] = useActionState<PlatformSettingsState, FormData>(
    savePlatformSettingsAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-bold text-ink">Branding</h3>
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Brand name</label>
          <input name="brandName" defaultValue={settings.brandName} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Logo URL</label>
          <input name="logoUrl" defaultValue={settings.logoUrl ?? ""} placeholder="https://…/logo.png" className={field} />
          <p className="mt-1 text-xs text-faint">Shown in the sidebar instead of the wordmark when set.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Support email</label>
          <input name="supportEmail" defaultValue={settings.supportEmail ?? ""} placeholder="support@yourbrand.com" className={field} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-ink">GST invoicing</h3>
        <p className="-mt-1 text-sm text-sub">Seller details printed on tax invoices.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Company name</label>
            <input name="companyName" defaultValue={settings.companyName ?? ""} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">GSTIN</label>
            <input name="gstin" defaultValue={settings.gstin ?? ""} placeholder="22AAAAA0000A1Z5" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-sub">Company address</label>
            <input name="companyAddress" defaultValue={settings.companyAddress ?? ""} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">GST %</label>
            <input name="gstPercent" type="number" min={0} max={100} defaultValue={settings.gstPercent} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Invoice prefix</label>
            <input name="invoicePrefix" defaultValue={settings.invoicePrefix} className={field} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-bold text-ink">Features</h3>
        <p className="-mt-1 text-sm text-sub">Turn product areas off across every workspace.</p>
        <div className="divide-y divide-line rounded-card border border-line">
          {FLAGS.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                name={f.key}
                defaultChecked={settings[f.key] as boolean}
                className="h-4 w-4 rounded border-line"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">{f.label}</span>
                <span className="block text-xs text-sub">{f.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}

      <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Save settings
      </button>
    </form>
  );
}
