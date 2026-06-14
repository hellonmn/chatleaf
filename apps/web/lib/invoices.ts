import { prisma } from "@watool/db";

/**
 * Generate a GST tax invoice for a paid charge (amount in paise, GST-inclusive).
 * Idempotent on the Razorpay payment id. Place of supply: intra-state
 * (CGST+SGST) when the buyer's GSTIN state matches the seller's or is unknown;
 * inter-state (IGST) otherwise.
 */
export async function createInvoiceForCharge(opts: {
  orgId: string;
  totalPaise: number;
  description: string;
  razorpayPaymentId?: string | null;
}): Promise<void> {
  if (opts.razorpayPaymentId) {
    const existing = await prisma.invoice.findUnique({
      where: { razorpayPaymentId: opts.razorpayPaymentId },
      select: { id: true },
    });
    if (existing) return;
  }

  const [settings, org, count] = await Promise.all([
    prisma.platformSettings.findUnique({ where: { id: "global" } }),
    prisma.org.findUnique({ where: { id: opts.orgId }, select: { name: true, gstin: true } }),
    prisma.invoice.count(),
  ]);
  if (!org) return;

  const gstPercent = settings?.gstPercent ?? 18;
  const total = opts.totalPaise;
  const subtotal = Math.round(total / (1 + gstPercent / 100));
  const gstAmount = total - subtotal;

  const sellerState = settings?.gstin?.slice(0, 2);
  const buyerState = org.gstin?.slice(0, 2);
  const interState = !!sellerState && !!buyerState && sellerState !== buyerState;
  const cgst = interState ? 0 : Math.round(gstAmount / 2);
  const sgst = interState ? 0 : gstAmount - cgst;
  const igst = interState ? gstAmount : 0;

  const prefix = settings?.invoicePrefix || "INV";
  const year = new Date().getFullYear();
  const number = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;

  await prisma.invoice.create({
    data: {
      orgId: opts.orgId,
      number,
      razorpayPaymentId: opts.razorpayPaymentId ?? null,
      description: opts.description,
      subtotal,
      gstPercent,
      cgst,
      sgst,
      igst,
      total,
      buyerName: org.name,
      buyerGstin: org.gstin,
      sellerName: settings?.companyName || settings?.brandName || "Chatleaf",
      sellerGstin: settings?.gstin ?? null,
    },
  });
}
