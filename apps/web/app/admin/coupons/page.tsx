import { Ticket } from "lucide-react";
import { prisma } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card, SectionCard } from "@/components/ui/Card";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { toggleCouponAction, deleteCouponAction } from "@/lib/actions/admin";
import { CouponForm } from "./CouponForm";

export default async function AdminCouponsPage() {
  await requirePlatformAdmin();
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Coupons</h2>
        <p className="mt-0.5 text-sm text-sub">
          Discount codes mapped to Razorpay Offers, applied at checkout.
        </p>
      </div>

      <SectionCard title="Create / update a coupon">
        <CouponForm />
      </SectionCard>

      <Card className="overflow-hidden">
        {coupons.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">No coupons yet.</div>
        ) : (
          <div className="divide-y divide-line">
            {coupons.map((c) => {
              const expired = c.expiresAt && c.expiresAt.getTime() < Date.now();
              return (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-ink">
                    <Ticket className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">{c.code}</span>
                      {!c.active && (
                        <span className="rounded-pill bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">inactive</span>
                      )}
                      {expired && (
                        <span className="rounded-pill bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">expired</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {c.description ? `${c.description} · ` : ""}
                      {c.razorpayOfferId ?? "no offer"} · used {c.redeemedCount}
                      {c.maxRedemptions ? `/${c.maxRedemptions}` : ""}
                      {c.expiresAt ? ` · expires ${c.expiresAt.toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <form action={toggleCouponAction}>
                    <input type="hidden" name="couponId" value={c.id} />
                    <input type="hidden" name="value" value={(!c.active).toString()} />
                    <button className="rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
                      {c.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={deleteCouponAction}>
                    <input type="hidden" name="couponId" value={c.id} />
                    <ConfirmSubmit
                      message={`Delete coupon ${c.code}?`}
                      className="rounded-btn bg-rose/10 px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose/15"
                    >
                      Delete
                    </ConfirmSubmit>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
