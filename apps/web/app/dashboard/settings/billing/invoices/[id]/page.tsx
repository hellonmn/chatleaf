import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { PrintButton } from "./PrintButton";

function inr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireActiveContext();
  const { id } = await params;
  const inv = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!inv) notFound();
  const settings = await getPlatformSettings();
  const interState = inv.igst > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-lg font-bold text-ink">Tax invoice</h1>
        <PrintButton />
      </div>

      <div className="rounded-card border border-line bg-white p-8 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-extrabold text-ink">
              {settings.companyName || settings.brandName}
            </div>
            {settings.companyAddress && (
              <div className="mt-0.5 max-w-xs whitespace-pre-line text-xs text-sub">
                {settings.companyAddress}
              </div>
            )}
            {inv.sellerGstin && (
              <div className="mt-1 text-xs text-sub">GSTIN: {inv.sellerGstin}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-bold uppercase tracking-wide text-faint">Tax Invoice</div>
            <div className="mt-1 text-sm font-semibold text-ink">{inv.number}</div>
            <div className="text-xs text-sub">{inv.issuedAt.toLocaleDateString()}</div>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-faint">Billed to</div>
          <div className="mt-1 text-sm font-semibold text-ink">{inv.buyerName}</div>
          {inv.buyerGstin && <div className="text-xs text-sub">GSTIN: {inv.buyerGstin}</div>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-3 text-ink">{inv.description}</td>
              <td className="py-3 text-right text-ink">{inr(inv.subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1.5 text-sm">
          <Row label="Taxable value" value={inr(inv.subtotal)} />
          {interState ? (
            <Row label={`IGST @${inv.gstPercent}%`} value={inr(inv.igst)} />
          ) : (
            <>
              <Row label={`CGST @${inv.gstPercent / 2}%`} value={inr(inv.cgst)} />
              <Row label={`SGST @${inv.gstPercent / 2}%`} value={inr(inv.sgst)} />
            </>
          )}
          <div className="flex items-center justify-between border-t border-line pt-2 text-base font-bold text-ink">
            <span>Total</span>
            <span>{inr(inv.total)}</span>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-faint">
          This is a computer-generated invoice.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sub">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
