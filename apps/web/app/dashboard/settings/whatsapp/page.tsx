import { Smartphone, AlertTriangle } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { getRequestBaseUrl } from "@/lib/base-url";
import { disconnectWhatsAppAction, type ConnectValues } from "@/lib/actions/whatsapp";
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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect your WhatsApp Business number via the Meta Cloud API.
        </p>
      </div>

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

      {/* Connect / update form */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {primary ? "Update credentials" : "Connect a number"}
        </h2>
        {manage ? (
          <ConnectForm defaults={defaults} hasToken={!!primary?.accessTokenEnc} />
        ) : (
          <p className="text-sm text-slate-500">
            Only owners and admins can connect WhatsApp.
          </p>
        )}
      </section>
    </div>
  );
}
