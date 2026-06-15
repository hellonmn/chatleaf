import Script from "next/script";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PLANS } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { getPlanConfig } from "@/lib/plan-config";
import { getPlatformSettings } from "@/lib/platform-settings";
import { razorpayConfigured } from "@/lib/razorpay";
import { Card } from "@/components/ui/Card";
import { CheckoutButton } from "./CheckoutButton";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; code?: string }>;
}) {
  const ctx = await requireActiveContext();
  const sp = await searchParams;
  const isPaidPlan = PLANS.includes(sp.plan as never) && sp.plan !== "FREE";
  if (!isPaidPlan || ctx.role !== "OWNER" || !(await razorpayConfigured())) {
    redirect("/dashboard/settings/billing");
  }
  const plan = sp.plan as (typeof PLANS)[number];
  const code = (sp.code ?? "").trim();
  const [config, settings] = await Promise.all([getPlanConfig(plan), getPlatformSettings()]);

  const total = config.priceInr;
  const taxable = Math.round(total / (1 + settings.gstPercent / 100));
  const gst = total - taxable;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <Link href="/dashboard/settings/billing" className="inline-flex items-center gap-1 text-sm text-sub hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to billing
      </Link>

      <Card className="p-6">
        <h1 className="text-lg font-extrabold tracking-tight text-ink">Checkout</h1>
        <p className="mt-0.5 text-sm text-sub">{config.label} plan — billed monthly</p>

        <div className="mt-4 space-y-2 rounded-card bg-canvas p-4 text-sm">
          <div className="flex justify-between"><span className="text-sub">{config.label} plan</span><span className="text-ink">{inr(taxable)}</span></div>
          <div className="flex justify-between"><span className="text-sub">GST ({settings.gstPercent}%)</span><span className="text-ink">{inr(gst)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 font-bold"><span className="text-ink">Total / month</span><span className="text-brand">{inr(total)}</span></div>
          {config.trialDays > 0 && (
            <div className="rounded-pill bg-emerald-50 px-2 py-1 text-center text-xs font-semibold text-emerald-700">
              {config.trialDays}-day free trial — first charge after the trial
            </div>
          )}
          {code && (
            <div className="text-center text-xs text-sub">Promo code <span className="font-mono font-semibold">{code.toUpperCase()}</span> will be applied</div>
          )}
        </div>

        <div className="mt-4">
          <CheckoutButton
            plan={plan}
            code={code}
            planLabel={config.label}
            brandName={settings.brandName}
            prefillName={ctx.name ?? ""}
            prefillEmail={ctx.email}
          />
        </div>
        <p className="mt-3 text-center text-xs text-faint">
          Secured by Razorpay. Your plan activates as soon as payment is confirmed.
        </p>
      </Card>
    </div>
  );
}
