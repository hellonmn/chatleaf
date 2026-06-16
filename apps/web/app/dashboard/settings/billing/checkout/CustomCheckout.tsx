"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createCheckoutSubscriptionAction, confirmCheckoutAction } from "@/lib/actions/billing";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function CustomCheckout({
  plan,
  code,
  planLabel,
  brandName,
  prefillName,
  prefillEmail,
}: {
  plan: string;
  code: string;
  planLabel: string;
  brandName: string;
  prefillName: string;
  prefillEmail: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        prefill: { name: prefillName, email: prefillEmail },
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
    <div className="space-y-2">
      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Pay securely
      </button>
      {error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
    </div>
  );
}
