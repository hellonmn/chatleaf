import {
  Smartphone,
  AlertTriangle,
  Globe,
  MessageCircle,
  Send,
  Instagram,
  Bell,
  Settings,
} from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { getRequestBaseUrl } from "@/lib/base-url";
import { disconnectWhatsAppAction, type ConnectValues } from "@/lib/actions/whatsapp";
import { EmbeddedSignup } from "@/components/EmbeddedSignup";
import { ConnectForm } from "./ConnectForm";

export default async function WhatsAppSettingsPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { orgId: ctx.orgId },
    include: { phoneNumbers: true },
    orderBy: { createdAt: "asc" },
  });

  // Primary = the account that actually has a number (else the first one).
  const primary = accounts.find((a) => a.phoneNumbers.length > 0) ?? accounts[0];
  const primaryPhone = primary?.phoneNumbers[0];
  const defaults: ConnectValues = {
    wabaId: primary?.wabaId,
    phoneNumberId: primaryPhone?.phoneNumberId,
    displayNumber: primaryPhone?.displayNumber,
    verifiedName: primaryPhone?.verifiedName ?? undefined,
  };

  const baseUrl = await getRequestBaseUrl();
  const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`;
  const verifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN ?? "(set META_WEBHOOK_VERIFY_TOKEN)";

  const embeddedConfigured =
    !!process.env.NEXT_PUBLIC_META_APP_ID && !!process.env.NEXT_PUBLIC_META_CONFIG_ID;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const msgsToday = await prisma.message.count({
    where: { orgId: ctx.orgId, direction: "OUT", createdAt: { gte: todayStart } },
  });
  const connected = primary?.status === "CONNECTED";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Banner */}
      <div className="flex items-start gap-4 rounded-card bg-brand p-5 text-white shadow-card-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10">
          <Globe className="h-6 w-6" />
        </span>
        <div>
          <div className="text-lg font-bold">One inbox, every channel</div>
          <p className="text-sm text-white/80">
            WhatsApp is live today. Telegram and Instagram are on the way —
            connect them the moment they launch.
          </p>
        </div>
      </div>

      {/* Channel cards */}
      <div className="space-y-3">
        {/* WhatsApp */}
        <div className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-card">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white">
            <MessageCircle className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink">WhatsApp Business</span>
              <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${connected ? "bg-brand-soft text-brand-ink" : "bg-warm/15 text-[#c47a2e]"}`}>
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <div className="truncate text-sm text-sub">
              {primaryPhone ? `${primaryPhone.displayNumber} · ${ctx.orgName}` : "No number connected yet"}
            </div>
            {primaryPhone?.verifiedName && (
              <div className="text-xs text-faint">⚡ {primaryPhone.verifiedName}</div>
            )}
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-xl font-extrabold text-brand">{msgsToday.toLocaleString()}</div>
            <div className="text-xs text-faint">msgs today</div>
          </div>
          <a href="#manage" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
            <Settings className="h-4 w-4" /> Manage
          </a>
        </div>

        {/* Telegram + Instagram — coming soon */}
        {[
          { name: "Telegram", desc: "Bot API integration", icon: Send, bg: "#229ED9" },
          { name: "Instagram DM", desc: "Direct messages via Meta", icon: Instagram, bg: "#E1306C" },
        ].map((ch) => {
          const Icon = ch.icon;
          return (
            <div key={ch.name} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-card">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: ch.bg }}>
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">{ch.name}</span>
                  <span className="rounded-pill bg-warm/15 px-2 py-0.5 text-xs font-semibold text-[#c47a2e]">Coming soon</span>
                </div>
                <div className="text-sm text-sub">{ch.desc}</div>
                <div className="text-xs text-faint">⚡ On the roadmap</div>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-btn bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand/15">
                <Bell className="h-4 w-4" /> Notify me
              </button>
            </div>
          );
        })}
      </div>

      {/* Connection health */}
      {connected && (
        <div className="rounded-card border border-line bg-white p-5 shadow-card">
          <div className="text-sm font-bold text-ink">WhatsApp Business — connection health</div>
          <p className="mt-0.5 text-sm text-sub">Your number and credentials at a glance.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Quality rating", value: primaryPhone?.qualityRating ?? "Unrated" },
              { label: "Display name", value: primaryPhone?.verifiedName ?? "Pending" },
              { label: "Phone status", value: connected ? "Verified" : "—" },
              { label: "Connection", value: (primary?.status ?? "—").toLowerCase() },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-canvas px-3 py-2.5">
                <div className="text-xs text-sub">{s.label}</div>
                <div className="mt-0.5 font-bold capitalize text-brand">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manage / connect ─────────────────────────────────────────── */}
      <div id="manage" className="space-y-5 pt-2">

      {/* Connected accounts */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Connected accounts
        </h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing connected yet.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between rounded-md border border-slate-200 p-3"
              >
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">
                      WABA {a.wabaId}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "CONNECTED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.status.toLowerCase()}
                    </span>
                  </div>
                  {a.phoneNumbers.length > 0 ? (
                    a.phoneNumbers.map((p) => (
                      <div key={p.id} className="mt-1 flex items-center gap-1.5 text-slate-600">
                        <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                        {p.displayNumber}
                        <span className="text-slate-400">· id {p.phoneNumberId}</span>
                      </div>
                    ))
                  ) : (
                    <div className="mt-1 flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      no phone number linked
                    </div>
                  )}
                </div>
                {manage && (
                  <form action={disconnectWhatsAppAction}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <button className="text-xs font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Webhook configuration to paste into Meta */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Webhook configuration
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          In Meta → your app → WhatsApp → Configuration, set the callback URL and
          verify token below, then subscribe to the <code>messages</code> field.
          For local testing, expose your dev server with a tunnel (e.g.{" "}
          <code>ngrok http 3000</code>) and open this page through that URL so it
          shows the tunnel address.
        </p>
        <dl className="space-y-2 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wide text-slate-400">
              Callback URL
            </dt>
            <dd>
              <code className="block break-all rounded bg-slate-100 px-2 py-1 text-[13px]">
                {webhookUrl}
              </code>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wide text-slate-400">
              Verify token
            </dt>
            <dd>
              <code className="block break-all rounded bg-slate-100 px-2 py-1 text-[13px]">
                {verifyToken}
              </code>
            </dd>
          </div>
        </dl>
      </section>

      {/* Embedded Signup — one-click connect via Facebook */}
      {manage && embeddedConfigured && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Connect with Facebook</h2>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">
            Authorize in a popup and pick (or create) your WhatsApp Business
            number — no IDs or tokens to copy. We subscribe the webhook for you.
          </p>
          <EmbeddedSignup />
        </section>
      )}

      {/* Manual connect (fallback / when Embedded Signup isn't configured) */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          {embeddedConfigured
            ? "Or connect manually"
            : primary
              ? "Update credentials"
              : "Connect a number"}
        </h2>
        {!embeddedConfigured && (
          <p className="mb-3 text-xs text-slate-500">
            Paste your WABA id, phone number id, and access token from the Meta
            dashboard. (Set <code>NEXT_PUBLIC_META_APP_ID</code> +{" "}
            <code>NEXT_PUBLIC_META_CONFIG_ID</code> to enable one-click Facebook
            signup instead.)
          </p>
        )}
        {manage ? (
          <ConnectForm defaults={defaults} hasToken={!!primary?.accessTokenEnc} />
        ) : (
          <p className="text-sm text-slate-500">
            Only owners and admins can connect WhatsApp.
          </p>
        )}
      </section>
      </div>
    </div>
  );
}
