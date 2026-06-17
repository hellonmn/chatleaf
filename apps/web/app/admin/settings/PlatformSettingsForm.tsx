"use client";

import { useActionState, useState } from "react";
import {
  savePlatformSettingsAction,
  type PlatformSettingsState,
} from "@/lib/actions/admin";
import type { PlatformSettings } from "@/lib/platform-settings";
import { LogoUpload } from "./LogoUpload";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

const FLAGS: { key: keyof PlatformSettings; label: string; desc: string }[] = [
  { key: "signupsEnabled", label: "Public signups", desc: "Allow new workspaces to register." },
  { key: "broadcastsEnabled", label: "Broadcasts", desc: "Bulk campaigns for all orgs." },
  { key: "flowsEnabled", label: "Automations / flows", desc: "The no-code chatbot builder." },
  { key: "templatesEnabled", label: "Message templates", desc: "Template create + sync." },
  { key: "aiEnabled", label: "AI assistant", desc: "Claude reply suggestions + AI node." },
];

const TABS = [
  { id: "branding", label: "Branding" },
  { id: "payments", label: "Payments" },
  { id: "invoicing", label: "Invoicing" },
  { id: "integrations", label: "Integrations" },
  { id: "features", label: "Features" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function SecretInput({ name, label, isSet }: { name: string; label: string; isSet: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-sub">
        {label} {isSet && <span className="text-emerald-600">· set</span>}
      </label>
      <input
        name={name}
        type="password"
        autoComplete="off"
        placeholder={isSet ? "•••••• (leave blank to keep)" : ""}
        className={field}
      />
    </div>
  );
}

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const [tab, setTab] = useState<TabId>("branding");
  const [state, action] = useActionState<PlatformSettingsState, FormData>(
    savePlatformSettingsAction,
    undefined,
  );
  const panel = (id: TabId) => (id === tab ? "space-y-3" : "hidden");

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-btn bg-canvas p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Logo upload (separate form) — branding tab only */}
      <div className={tab === "branding" ? "" : "hidden"}>
        <LogoUpload logoUrl={settings.logoUrl} brandName={settings.brandName} />
      </div>

      {/* Main settings form — all panels stay mounted so one save persists all */}
      <form action={action} className="space-y-5">
        {/* Branding */}
        <section className={panel("branding")}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Brand name</label>
            <input name="brandName" defaultValue={settings.brandName} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Support email</label>
            <input name="supportEmail" defaultValue={settings.supportEmail ?? ""} placeholder="support@yourbrand.com" className={field} />
          </div>
        </section>

        {/* Payments (Razorpay) */}
        <section className={panel("payments")}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Mode</label>
            <div className="flex gap-2">
              {(["test", "live"] as const).map((m) => (
                <label
                  key={m}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-btn border border-line px-3 py-2 text-sm font-semibold capitalize has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-ink"
                >
                  <input type="radio" name="razorpayMode" value={m} defaultChecked={settings.razorpayMode === m} className="accent-brand" />
                  {m}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-faint">Active mode is used for checkout, payment links, and webhooks.</p>
          </div>

          <div className="rounded-card border border-line p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">Test keys</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-sub">Key ID</label>
                <input name="razorpayTestKeyId" defaultValue={settings.razorpayTestKeyId ?? ""} placeholder="rzp_test_…" className={field} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SecretInput name="razorpayTestKeySecret" label="Key secret" isSet={settings.razorpayTestKeySecretSet} />
                <SecretInput name="razorpayTestWebhookSecret" label="Webhook secret" isSet={settings.razorpayTestWebhookSecretSet} />
              </div>
            </div>
          </div>

          <div className="rounded-card border border-line p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">Live keys</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-sub">Key ID</label>
                <input name="razorpayLiveKeyId" defaultValue={settings.razorpayLiveKeyId ?? ""} placeholder="rzp_live_…" className={field} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SecretInput name="razorpayLiveKeySecret" label="Key secret" isSet={settings.razorpayLiveKeySecretSet} />
                <SecretInput name="razorpayLiveWebhookSecret" label="Webhook secret" isSet={settings.razorpayLiveWebhookSecretSet} />
              </div>
            </div>
          </div>
          <p className="text-xs text-faint">
            Keys from Razorpay Dashboard → Settings → API Keys. Stored encrypted; override the env vars.
            Point the webhook at <code>/api/webhooks/razorpay</code>.
          </p>
        </section>

        {/* Invoicing (GST) */}
        <section className={panel("invoicing")}>
          <p className="-mt-1 text-sm text-sub">Seller details printed on GST tax invoices.</p>
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

        {/* Integrations (Meta / WhatsApp) */}
        <section className={panel("integrations")}>
          <h3 className="text-base font-bold text-ink">WhatsApp (Meta) webhook</h3>
          <p className="-mt-1 text-sm text-sub">
            Override the env vars. Paste the same verify token into Meta → WhatsApp →
            Configuration, and your App Secret (Meta → App → Settings → Basic).
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">App ID</label>
            <input name="metaAppId" defaultValue={settings.metaAppId ?? ""} placeholder="1234567890" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-sub">Webhook verify token</label>
            <input name="metaVerifyToken" defaultValue={settings.metaVerifyToken ?? ""} placeholder="a long random string" className={field} />
          </div>
          <SecretInput name="metaAppSecret" label="App Secret" isSet={settings.metaAppSecretSet} />
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" name="metaSkipSignatureCheck" defaultChecked={settings.metaSkipSignatureCheck} className="h-4 w-4 rounded border-line" />
            Skip signature verification (testing only — not recommended in production)
          </label>

          {/* Webhook relay → second platform */}
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-base font-bold text-ink">Forward to a second platform</h3>
            <p className="-mt-0.5 mb-3 text-sm text-sub">
              Meta allows only one callback URL per app. Enable this to relay every
              inbound event to another platform — the <strong>raw payload</strong> is
              forwarded with Meta&apos;s original{" "}
              <code className="rounded bg-canvas px-1 text-xs">X-Hub-Signature-256</code>{" "}
              header, so a Meta-style receiver can verify it against the same App Secret.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" name="webhookForwardEnabled" defaultChecked={settings.webhookForwardEnabled} className="h-4 w-4 rounded border-line" />
              Forward inbound webhook events
            </label>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-sub">Destination webhook URL</label>
              <input name="webhookForwardUrl" defaultValue={settings.webhookForwardUrl ?? ""} placeholder="https://your-other-platform.com/api/webhooks/whatsapp" className={field} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-sub">Extra header name (optional)</label>
                <input name="webhookForwardHeaderName" defaultValue={settings.webhookForwardHeaderName ?? ""} placeholder="Authorization" className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-sub">Extra header value (optional)</label>
                <input name="webhookForwardHeaderValue" defaultValue={settings.webhookForwardHeaderValue ?? ""} placeholder="Bearer your-token" className={field} />
              </div>
            </div>
            <p className="mt-2 text-xs text-faint">
              Use the extra header if the other platform needs its own auth token instead of
              (or in addition to) the Meta signature. Leave blank to forward only Meta&apos;s headers.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className={panel("features")}>
          <p className="-mt-1 text-sm text-sub">Turn product areas off across every workspace.</p>
          <div className="divide-y divide-line rounded-card border border-line">
            {FLAGS.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <input type="checkbox" name={f.key} defaultChecked={settings[f.key] as boolean} className="h-4 w-4 rounded border-line" />
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
    </div>
  );
}
