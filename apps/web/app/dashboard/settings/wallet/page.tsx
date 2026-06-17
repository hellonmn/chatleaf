import Script from "next/script";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Wallet as WalletIcon, AlertTriangle } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { canManageOrg } from "@watool/types";
import { getPlatformSettings } from "@/lib/platform-settings";
import { razorpayConfigured } from "@/lib/razorpay";
import { getOrCreateWallet, listTransactions } from "@/lib/wallet";
import { Card } from "@/components/ui/Card";
import { AddFunds } from "./AddFunds";

export const metadata = { title: "Wallet — Chatleaf" };

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  message: "Message",
  adjustment: "Adjustment",
  refund: "Refund",
  bonus: "Bonus",
};

export default async function WalletPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const [wallet, txns, settings, configured] = await Promise.all([
    getOrCreateWallet(ctx.orgId),
    listTransactions(ctx.orgId, 50),
    getPlatformSettings(),
    razorpayConfigured(),
  ]);

  const low = wallet.balancePaise <= wallet.lowBalanceThresholdPaise;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <div>
        <h1 className="text-xl font-bold text-ink">Wallet</h1>
        <p className="mt-1 text-sm text-sub">
          Add funds once and they&apos;re drawn down as you send. No per-message card swipes.
        </p>
      </div>

      {/* Balance + add funds */}
      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-sub">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand"><WalletIcon className="h-4 w-4" /></span>
            Current balance
          </div>
          <div className={`mt-3 text-4xl font-extrabold tracking-tight ${low ? "text-rose" : "text-ink"}`}>
            {rupees(wallet.balancePaise)}
          </div>
          {low && (
            <div className="mt-3 flex items-start gap-2 rounded-card bg-rose/10 px-3 py-2 text-xs font-medium text-rose">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Low balance — top up to keep messages sending.
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-bold text-ink">Add funds</h2>
          {!configured ? (
            <p className="mt-3 rounded-card bg-canvas px-3 py-2 text-sm text-sub">
              Payments aren&apos;t configured yet. Ask the platform admin to set up Razorpay.
            </p>
          ) : !manage ? (
            <p className="mt-3 rounded-card bg-canvas px-3 py-2 text-sm text-sub">
              Only owners and admins can add funds.
            </p>
          ) : (
            <div className="mt-3">
              <AddFunds brandName={settings.brandName} prefillName={ctx.name ?? ""} prefillEmail={ctx.email} />
            </div>
          )}
        </Card>
      </div>

      {/* Ledger */}
      <Card className="overflow-hidden">
        <h2 className="px-5 pt-5 text-sm font-bold text-ink">Transaction history</h2>
        {txns.length === 0 ? (
          <p className="px-5 py-6 text-sm text-faint">No transactions yet. Add funds to get started.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-5 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const credit = t.type === "CREDIT";
                return (
                  <tr key={t.id} className="border-b border-line/70 last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 text-sub">
                      {t.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${credit ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-sub"}`}>
                        {credit ? <ArrowUpCircle className="h-3 w-3" /> : <ArrowDownCircle className="h-3 w-3" />}
                        {KIND_LABEL[t.kind] ?? t.kind}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-sub" title={t.note ?? ""}>{t.note ?? "—"}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${credit ? "text-emerald-600" : "text-ink"}`}>
                      {credit ? "+" : "−"}{rupees(t.amountPaise)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-sub">{rupees(t.balanceAfterPaise)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
