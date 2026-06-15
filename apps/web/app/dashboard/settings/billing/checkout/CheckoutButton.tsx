"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createCheckoutSubscriptionAction, confirmCheckoutAction } from "@/lib/actions/billing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}

export function CheckoutButton({
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setLoading(true);
    const res = await createCheckoutSubscriptionAction(plan, code);
    if (!res || res.error || !res.subscriptionId || !res.keyId) {
      setError(res?.error ?? "Could not start checkout.");
      setLoading(false);
      return;
    }
    if (!window.Razorpay) {
      setError("Payment library is still loading — please try again in a moment.");
      setLoading(false);
      return;
    }
    const rzp = new window.Razorpay({
      key: res.keyId,
      subscription_id: res.subscriptionId,
      name: brandName,
      description: `${planLabel} plan subscription`,
      prefill: { name: prefillName, email: prefillEmail },
      theme: { color: "#0e7490" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (response: any) => {
        const res = await confirmCheckoutAction({
          paymentId: response.razorpay_payment_id,
          subscriptionId: response.razorpay_subscription_id,
          signature: response.razorpay_signature,
        });
        if (res?.error) {
          setError(res.error);
          setLoading(false);
          return;
        }
        router.push(
          res?.invoiceId
            ? `/dashboard/settings/billing?checkout=success&invoice=${res.invoiceId}`
            : "/dashboard/settings/billing?checkout=success",
        );
      },
      modal: { ondismiss: () => setLoading(false) },
    });
    rzp.on("payment.failed", () => {
      setError("Payment failed — please try again.");
      setLoading(false);
    });
    rzp.open();
  }

  return (
    <div className="space-y-2">
      <button
        onClick={pay}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Pay securely
      </button>
      {error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
    </div>
  );
}
