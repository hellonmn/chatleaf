"use client";

import { useState } from "react";
import { Plus, Pencil, ShieldAlert, PlugZap } from "lucide-react";
import { disconnectWhatsAppAction } from "@/lib/actions/whatsapp";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmbeddedSignup } from "@/components/EmbeddedSignup";
import { WaIcon } from "@/components/WaIcon";
import { ConnectForm } from "./ConnectForm";

export type Channel = {
  id: string;
  wabaId: string;
  status: string;
  hasToken: boolean;
  phones: { id: string; phoneNumberId: string; displayNumber: string; verifiedName: string | null; qualityRating: string | null }[];
};

const STATUS_PILL: Record<string, string> = {
  CONNECTED: "bg-brand-soft text-brand-ink",
  ERROR: "bg-rose/10 text-rose",
  DISCONNECTED: "bg-warm/15 text-[#c47a2e]",
  PENDING: "bg-slate-100 text-slate-600",
};

function WebhookBox({ url, token }: { url: string; token: string }) {
  return (
    <div className="rounded-card border border-line bg-canvas p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-faint">Webhook (paste into Meta)</div>
      <div className="mt-2 space-y-2 text-sm">
        <div>
          <div className="text-[11px] text-faint">Callback URL</div>
          <code className="block break-all rounded bg-white px-2 py-1 text-[13px]">{url}</code>
        </div>
        <div>
          <div className="text-[11px] text-faint">Verify token</div>
          <code className="block break-all rounded bg-white px-2 py-1 text-[13px]">{token}</code>
        </div>
      </div>
    </div>
  );
}

export function ChannelsManager({
  channels,
  webhookUrl,
  verifyToken,
  embeddedConfigured,
  manage,
}: {
  channels: Channel[];
  webhookUrl: string;
  verifyToken: string;
  embeddedConfigured: boolean;
  manage: boolean;
}) {
  const [selected, setSelected] = useState<string>(channels[0]?.id ?? "new");
  const [editing, setEditing] = useState(false);

  const active = channels.find((c) => c.id === selected);
  const select = (id: string) => { setSelected(id); setEditing(false); };

  const rowCls = (on: boolean) =>
    `flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors ${
      on ? "border-brand bg-brand-soft" : "border-line bg-white hover:bg-canvas"
    }`;

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      {/* Left: channel list */}
      <div className="space-y-2">
        <div className="px-1 text-xs font-bold uppercase tracking-wide text-faint">WhatsApp numbers</div>
        {channels.map((c) => {
          const phone = c.phones[0];
          return (
            <button key={c.id} type="button" onClick={() => select(c.id)} className={rowCls(selected === c.id)}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white">
                <img src="/channels/whatsapp.png" alt="WhatsApp" className={`h-6 w-6 object-contain ${c.status === "DISCONNECTED" ? "grayscale" : ""}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {phone?.displayNumber ?? `WABA ${c.wabaId}`}
                </span>
                <span className={`mt-0.5 inline-block rounded-pill px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_PILL[c.status] ?? STATUS_PILL.PENDING}`}>
                  {c.status.toLowerCase()}
                </span>
              </span>
            </button>
          );
        })}

        {manage && (
          <button type="button" onClick={() => select("new")} className={rowCls(selected === "new")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-brand">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-ink">Connect a number</span>
          </button>
        )}

        <div className="px-1 pt-3 text-xs font-bold uppercase tracking-wide text-faint">Coming soon</div>
        {[{ name: "Telegram", logo: "/channels/telegram.png" }, { name: "Instagram DM", logo: "/channels/instagram.png" }].map((ch) => (
          <div key={ch.name} className="flex items-center gap-3 rounded-card border border-line bg-white px-3 py-2.5 opacity-70">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white">
              <img src={ch.logo} alt={ch.name} className="h-6 w-6 object-contain" />
            </span>
            <span className="text-sm font-semibold text-sub">{ch.name}</span>
            <span className="ml-auto rounded-pill bg-warm/15 px-2 py-0.5 text-[10px] font-semibold text-[#c47a2e]">soon</span>
          </div>
        ))}
      </div>

      {/* Right: detail / connect */}
      <div className="space-y-5">
        {selected === "new" || !active ? (
          <div className="space-y-5 rounded-card border border-line bg-white p-5 shadow-card">
            <div>
              <h2 className="text-base font-bold text-ink">Connect a WhatsApp number</h2>
              <p className="mt-0.5 text-sm text-sub">Each number is its own channel with its own inbox.</p>
            </div>
            {manage ? (
              <>
                {embeddedConfigured && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-sub">One-click via Facebook</div>
                    <EmbeddedSignup />
                    <div className="text-center text-xs text-faint">or connect manually</div>
                  </div>
                )}
                <ConnectForm defaults={{}} hasToken={false} />
                <WebhookBox url={webhookUrl} token={verifyToken} />
              </>
            ) : (
              <p className="text-sm text-sub">Only owners and admins can connect WhatsApp.</p>
            )}
          </div>
        ) : (
          <>
            {/* Account header */}
            <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
              <div className="flex items-start gap-4 border-b border-line bg-gradient-to-br from-[#25D366]/10 to-transparent p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-white shadow-sm">
                  <WaIcon className={`h-7 w-7 ${active.status === "DISCONNECTED" ? "grayscale" : ""}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-ink">{active.phones[0]?.displayNumber ?? `WABA ${active.wabaId}`}</span>
                    <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[active.status] ?? STATUS_PILL.PENDING}`}>
                      {active.status.toLowerCase()}
                    </span>
                  </div>
                  {active.phones[0]?.verifiedName && (
                    <div className="mt-0.5 text-sm text-sub">{active.phones[0]!.verifiedName}</div>
                  )}
                  <div className="mt-0.5 text-xs text-faint">WABA {active.wabaId}</div>
                </div>
                {manage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-white px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
                      <Pencil className="h-4 w-4" /> {editing ? "Close" : active.status === "DISCONNECTED" ? "Reconnect" : "Edit"}
                    </button>
                    {active.status !== "DISCONNECTED" && (
                      <form action={disconnectWhatsAppAction}>
                        <input type="hidden" name="accountId" value={active.id} />
                        <ConfirmSubmit message={`Disconnect ${active.phones[0]?.displayNumber ?? "this number"}? Its templates will be removed; contacts and chats stay.`} className="rounded-btn bg-rose/10 px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose/15">
                          Disconnect
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                )}
              </div>

              <div className="p-5">
              {active.status === "ERROR" && (
                <div className="mb-4 flex items-start gap-2 rounded-card bg-rose/10 px-3 py-2 text-sm text-rose">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  This number's access token is invalid/expired. Edit the connection to reconnect.
                </div>
              )}

              {active.status === "DISCONNECTED" && (
                <div className="mb-4 flex items-start gap-2 rounded-card bg-warm/15 px-3 py-2 text-sm text-[#c47a2e]">
                  <PlugZap className="mt-0.5 h-4 w-4 shrink-0" />
                  This number is disconnected. Click <strong>Reconnect</strong> and re-enter the access token to use it again.
                </div>
              )}

              {/* Health */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Quality", value: active.phones[0]?.qualityRating ?? "Unrated" },
                  { label: "Display name", value: active.phones[0]?.verifiedName ?? "Pending" },
                  { label: "Phone number id", value: active.phones[0]?.phoneNumberId ?? "—" },
                  { label: "Token", value: active.hasToken ? "Saved" : "Missing" },
                ].map((s) => (
                  <div key={s.label} className="min-w-0 rounded-xl bg-canvas px-3 py-2.5">
                    <div className="text-xs text-sub">{s.label}</div>
                    <div className="mt-0.5 truncate text-sm font-bold text-brand">{s.value}</div>
                  </div>
                ))}
              </div>
              </div>
            </div>

            {/* Inline edit */}
            {manage && editing && (
              <div className="rounded-card border border-line bg-white p-5 shadow-card">
                <h3 className="mb-3 text-sm font-bold text-ink">Edit connection</h3>
                <ConnectForm
                  defaults={{
                    wabaId: active.wabaId,
                    phoneNumberId: active.phones[0]?.phoneNumberId,
                    displayNumber: active.phones[0]?.displayNumber,
                    verifiedName: active.phones[0]?.verifiedName ?? undefined,
                  }}
                  hasToken={active.hasToken}
                />
              </div>
            )}

            <WebhookBox url={webhookUrl} token={verifyToken} />
          </>
        )}
      </div>
    </div>
  );
}
