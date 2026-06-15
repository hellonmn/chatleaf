"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone, CreditCard } from "lucide-react";
import { createCheckoutSubscriptionAction, confirmCheckoutAction } from "@/lib/actions/billing";
import type { RazorpayMethods } from "@/lib/razorpay";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Razorpay subscriptions register a recurring mandate, which only UPI (Autopay)
// and Cards support — netbanking eMandate is bank-limited and wallets can't do
// recurring — so those are intentionally not offered here. The payment itself
// happens in Razorpay's Checkout (a secure overlay on this page, not a redirect).
type Method = "upi" | "card";

const ICONS: Record<Method, typeof Smartphone> = { upi: Smartphone, card: CreditCard };
const LABELS: Record<Method, string> = { upi: "UPI Autopay", card: "Card" };

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

  const m = methods ?? { card: true, upi: true, netbanking: [], wallets: [] };
  const enabled: Method[] = [
    ...(m.upi ? (["upi"] as const) : []),
    ...(m.card ? (["card"] as const) : []),
  ];
  const tabs = (enabled.length ? enabled : (["card", "upi"] as Method[])).map((id) => ({
    id,
    label: LABELS[id],
    icon: ICONS[id],
  }));

  const [method, setMethod] = useState<Method>(tabs[0]!.id);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

  async function onSuccess(resp: any) {
    const r = await confirmCheckoutAction({
      paymentId: resp.razorpay_payment_id,
      subscriptionId: resp.razorpay_subscription_id,
      signature: resp.razorpay_signature,
    });
    if (r?.error) {
      setError(r.error);
      setBusy(false);
      return;
    }
    router.push(
      r?.invoiceId
        ? `/dashboard/settings/billing?checkout=success&invoice=${r.invoiceId}`
        : "/dashboard/settings/billing?checkout=success",
    );
  }

  async function pay() {
    setError(null);
    if (!/^\d{10}$/.test(contact.trim())) return setError("Enter a valid 10-digit mobile number.");
    if (!(window as any).Razorpay) return setError("Payment library is still loading — try again.");

    setBusy(true);
    try {
      const res = await createCheckoutSubscriptionAction(plan, code);
      if (!res || res.error || !res.subscriptionId || !res.keyId) {
        setError(res?.error ?? "Could not start checkout.");
        setBusy(false);
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: brandName,
        description: `${planLabel} plan subscription`,
        prefill: { name: prefillName, email: prefillEmail, contact, method },
        theme: { color: "#0e7490" },
        handler: onSuccess,
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (e: any) => {
        setError(e?.error?.description ?? "Payment failed — please try again.");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
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

      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pay now
      </button>

      <p className="text-center text-xs text-faint">
        Subscriptions are charged automatically each month via UPI Autopay or a card mandate.
      </p>
      {error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
    </div>
  );
}
