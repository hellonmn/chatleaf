"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createWalletTopupAction, confirmWalletTopupAction } from "@/lib/actions/wallet";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PRESETS = [500, 1000, 2000, 5000];

export function AddFunds({
  brandName,
  prefillName,
  prefillEmail,
}: {
  brandName: string;
  prefillName: string;
  prefillEmail: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSuccess(resp: any, orderId: string, amountPaise: number) {
    const r = await confirmWalletTopupAction({
      orderId,
      paymentId: resp.razorpay_payment_id,
      signature: resp.razorpay_signature,
      amountPaise,
    });
    if (r?.error) {
      setError(r.error);
      setBusy(false);
      return;
    }
    setOk(r?.ok ?? "Funds added.");
    setBusy(false);
    router.refresh();
  }

  async function pay() {
    setError(null);
    setOk(null);
    if (!(window as any).Razorpay) return setError("Payment library is still loading — try again.");
    if (!Number.isFinite(amount) || amount < 100) return setError("Minimum top-up is ₹100.");
    setBusy(true);
    try {
      const res = await createWalletTopupAction(amount);
      if (!res || res.error || !res.orderId || !res.keyId || !res.amountPaise) {
        setError(res?.error ?? "Could not start top-up.");
        setBusy(false);
        return;
      }
      const { orderId, keyId, amountPaise } = res;
      const rzp = new (window as any).Razorpay({
        key: keyId,
        order_id: orderId,
        amount: amountPaise,
        currency: "INR",
        name: brandName,
        description: "Wallet top-up",
        prefill: { name: prefillName, email: prefillEmail },
        theme: { color: "#0e7490" },
        handler: (resp: any) => onSuccess(resp, orderId, amountPaise),
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (e: any) => {
        setError(e?.error?.description ?? "Payment failed — please try again.");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start top-up.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            className={`rounded-btn border px-3 py-1.5 text-sm font-semibold transition-colors ${
              amount === p ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-sub hover:bg-canvas"
            }`}
          >
            ₹{p.toLocaleString("en-IN")}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Or enter an amount (₹)</label>
        <input
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
          className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add ₹{(Number.isFinite(amount) ? amount : 0).toLocaleString("en-IN")}
      </button>

      {error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
      {ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p>}
      <p className="text-center text-xs text-faint">Secured by Razorpay. Funds are added instantly on success.</p>
    </div>
  );
}
