"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone, CreditCard, Building2, Wallet } from "lucide-react";
import { createCheckoutSubscriptionAction, confirmCheckoutAction } from "@/lib/actions/billing";
import type { RazorpayMethods } from "@/lib/razorpay";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Method = "upi" | "card" | "netbanking" | "wallet";

// Used only if the live methods fetch fails.
const FALLBACK_BANKS = [
  { code: "HDFC", name: "HDFC Bank" },
  { code: "ICIC", name: "ICICI Bank" },
  { code: "SBIN", name: "State Bank of India" },
  { code: "UTIB", name: "Axis Bank" },
  { code: "KKBK", name: "Kotak Mahindra" },
];
const FALLBACK_WALLETS = [
  { code: "freecharge", name: "Freecharge" },
  { code: "mobikwik", name: "Mobikwik" },
];

const ICONS: Record<Method, typeof Smartphone> = {
  upi: Smartphone,
  card: CreditCard,
  netbanking: Building2,
  wallet: Wallet,
};
const LABELS: Record<Method, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
};

export function CustomCheckout({
  plan,
  code,
  planLabel,
  brandName,
  prefillName,
  prefillEmail,
  methods,
}: {
  plan: string;
  code: string;
  planLabel: string;
  brandName: string;
  prefillName: string;
  prefillEmail: string;
  methods: RazorpayMethods | null;
}) {
  const router = useRouter();

  // Resolve enabled methods + live bank/wallet lists (with fallbacks).
  const m = methods ?? { card: true, upi: true, netbanking: [], wallets: [] };
  const banks = m.netbanking.length ? m.netbanking : FALLBACK_BANKS;
  const wallets = m.wallets.length ? m.wallets : FALLBACK_WALLETS;
  const enabled: Method[] = [
    ...(m.upi ? (["upi"] as const) : []),
    ...(m.card ? (["card"] as const) : []),
    ...(banks.length ? (["netbanking"] as const) : []),
    ...(wallets.length ? (["wallet"] as const) : []),
  ];
  const tabs = (enabled.length ? enabled : (["card"] as Method[])).map((id) => ({
    id,
    label: LABELS[id],
    icon: ICONS[id],
  }));

  const [method, setMethod] = useState<Method>(tabs[0]!.id);
  const [contact, setContact] = useState("");
  const [vpa, setVpa] = useState("");
  const [bank, setBank] = useState(banks[0]!.code);
  const [wallet, setWallet] = useState(wallets[0]!.code);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<{ subscriptionId: string; keyId: string } | null>(null);

  const field =
    "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

  /** Create the subscription once and reuse it across retries. */
  async function ensureSubscription() {
    if (subRef.current) return subRef.current;
    const res = await createCheckoutSubscriptionAction(plan, code);
    if (!res || res.error || !res.subscriptionId || !res.keyId) {
      throw new Error(res?.error ?? "Could not start checkout.");
    }
    subRef.current = { subscriptionId: res.subscriptionId, keyId: res.keyId };
    return subRef.current;
  }

  async function onSuccess(resp: any) {
    setStatus("Confirming…");
    const r = await confirmCheckoutAction({
      paymentId: resp.razorpay_payment_id,
      subscriptionId: resp.razorpay_subscription_id,
      signature: resp.razorpay_signature,
    });
    if (r?.error) {
      setError(r.error);
      setBusy(false);
      setStatus(null);
      return;
    }
    router.push(
      r?.invoiceId
        ? `/dashboard/settings/billing?checkout=success&invoice=${r.invoiceId}`
        : "/dashboard/settings/billing?checkout=success",
    );
  }

  function fail(msg: string) {
    setError(msg);
    setBusy(false);
    setStatus(null);
  }

  async function pay() {
    setError(null);
    if (!/^\d{10}$/.test(contact.trim())) return setError("Enter a valid 10-digit mobile number.");
    if (method === "upi" && !/^[\w.\-]+@[\w.\-]+$/.test(vpa.trim())) {
      return setError("Enter a valid UPI ID (e.g. name@bank).");
    }
    if (!(window as any).Razorpay) return setError("Payment library is still loading — try again.");

    setBusy(true);
    setStatus("Starting…");
    try {
      const { subscriptionId, keyId } = await ensureSubscription();

      // Card → Razorpay's secure modal (PCI handled by Razorpay).
      if (method === "card") {
        const rzp = new (window as any).Razorpay({
          key: keyId,
          subscription_id: subscriptionId,
          name: brandName,
          description: `${planLabel} plan`,
          prefill: { name: prefillName, email: prefillEmail, contact, method: "card" },
          theme: { color: "#0e7490" },
          handler: onSuccess,
          modal: { ondismiss: () => { setBusy(false); setStatus(null); } },
        });
        rzp.on("payment.failed", (e: any) => fail(e?.error?.description ?? "Payment failed."));
        rzp.open();
        return;
      }

      // UPI / netbanking / wallet → custom createPayment on our page.
      const rzp = new (window as any).Razorpay({ key: keyId });
      rzp.on("payment.success", onSuccess);
      rzp.on("payment.error", (e: any) => fail(e?.error?.description ?? "Payment failed."));
      const base = { subscription_id: subscriptionId, email: prefillEmail || "owner@example.com", contact };
      if (method === "upi") {
        rzp.createPayment({ ...base, method: "upi", vpa: vpa.trim() });
        setStatus("Approve the payment request in your UPI app…");
      } else if (method === "netbanking") {
        rzp.createPayment({ ...base, method: "netbanking", bank });
        setStatus("Continue on your bank's page…");
      } else {
        rzp.createPayment({ ...base, method: "wallet", wallet });
        setStatus("Continue on the wallet page…");
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : "Could not start checkout.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Method tabs */}
      <div className={`grid gap-2 grid-cols-${Math.min(4, tabs.length)}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = method === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMethod(t.id); setError(null); }}
              className={`flex flex-col items-center gap-1 rounded-card border px-2 py-2.5 text-xs font-semibold ${
                active ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-sub hover:bg-canvas"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Mobile number</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="numeric" maxLength={10} placeholder="10-digit mobile" className={field} />
      </div>

      {method === "upi" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">UPI ID</label>
          <input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@bank" className={field} />
        </div>
      )}
      {method === "netbanking" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Bank</label>
          <select value={bank} onChange={(e) => setBank(e.target.value)} className={field}>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
      )}
      {method === "wallet" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-sub">Wallet</label>
          <select value={wallet} onChange={(e) => setWallet(e.target.value)} className={field}>
            {wallets.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
          </select>
        </div>
      )}
      {method === "card" && (
        <p className="rounded-md bg-canvas px-3 py-2 text-xs text-sub">
          Card details are entered in Razorpay&apos;s secure window for your safety (PCI-compliant).
        </p>
      )}

      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pay now
      </button>

      {status && <p className="text-center text-sm text-sub">{status}</p>}
      {error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
    </div>
  );
}
