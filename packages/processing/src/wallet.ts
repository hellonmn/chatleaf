import { prisma } from "@watool/db";

/**
 * Prepaid wallet + per-message metering. Balances are in **paise** (integer — no
 * floats). Lives in @watool/processing so both the web app and the worker /
 * broadcast sender can credit, debit, and meter against the same logic.
 */

export type WalletTxnKind = "topup" | "message" | "adjustment" | "refund" | "bonus";

export type LedgerMeta = {
  kind: WalletTxnKind;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
  razorpayPaymentId?: string | null;
};

/** WhatsApp message category → the platform's base cost field on PlatformSettings. */
export type MessageCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION" | "SERVICE";

export async function getOrCreateWallet(orgId: string) {
  return prisma.wallet.upsert({ where: { orgId }, create: { orgId }, update: {} });
}

export async function getBalancePaise(orgId: string): Promise<number> {
  const w = await prisma.wallet.findUnique({ where: { orgId }, select: { balancePaise: true } });
  return w?.balancePaise ?? 0;
}

export async function creditWallet(
  orgId: string,
  amountPaise: number,
  meta: LedgerMeta,
): Promise<{ balancePaise: number }> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("Credit amount must be a positive integer (paise).");
  }
  await getOrCreateWallet(orgId);
  const wallet = await prisma.wallet.update({
    where: { orgId },
    data: { balancePaise: { increment: amountPaise } },
  });
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      orgId,
      type: "CREDIT",
      amountPaise,
      balanceAfterPaise: wallet.balancePaise,
      kind: meta.kind,
      note: meta.note ?? null,
      refType: meta.refType ?? null,
      refId: meta.refId ?? null,
      razorpayPaymentId: meta.razorpayPaymentId ?? null,
    },
  });
  return { balancePaise: wallet.balancePaise };
}

export async function debitWallet(
  orgId: string,
  amountPaise: number,
  meta: LedgerMeta,
): Promise<{ ok: true; balancePaise: number } | { ok: false; balancePaise: number }> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("Debit amount must be a positive integer (paise).");
  }
  await getOrCreateWallet(orgId);

  // Conditional decrement: only succeeds if the balance still covers it, so two
  // concurrent sends can't overdraw.
  const res = await prisma.wallet.updateMany({
    where: { orgId, balancePaise: { gte: amountPaise } },
    data: { balancePaise: { decrement: amountPaise } },
  });
  if (res.count === 0) {
    return { ok: false, balancePaise: await getBalancePaise(orgId) };
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { orgId } });
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      orgId,
      type: "DEBIT",
      amountPaise,
      balanceAfterPaise: wallet.balancePaise,
      kind: meta.kind,
      note: meta.note ?? null,
      refType: meta.refType ?? null,
      refId: meta.refId ?? null,
      razorpayPaymentId: meta.razorpayPaymentId ?? null,
    },
  });
  return { ok: true, balancePaise: wallet.balancePaise };
}

export async function listTransactions(orgId: string, limit = 50) {
  return prisma.walletTransaction.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Whether wallet billing is switched on platform-wide. When off, sends are
 *  never metered (the WABA owner pays Meta directly). */
export async function isWalletBillingEnabled(): Promise<boolean> {
  const s = await prisma.platformSettings.findUnique({
    where: { id: "global" },
    select: { walletBillingEnabled: true },
  });
  return !!s?.walletBillingEnabled;
}

/** Cost the org is charged for one message of `category`, in paise. Base rate ×
 *  (1 + markup%). Returns 0 when billing is disabled or no rate is set. */
export async function getMessageCostPaise(category: string): Promise<number> {
  const s = await prisma.platformSettings.findUnique({
    where: { id: "global" },
    select: {
      walletBillingEnabled: true,
      walletMarkupPercent: true,
      rateMarketingPaise: true,
      rateUtilityPaise: true,
      rateAuthPaise: true,
      rateServicePaise: true,
    },
  });
  if (!s || !s.walletBillingEnabled) return 0;
  const cat = (category || "").toUpperCase();
  const base =
    cat === "UTILITY" ? s.rateUtilityPaise
    : cat === "AUTHENTICATION" ? s.rateAuthPaise
    : cat === "SERVICE" ? s.rateServicePaise
    : s.rateMarketingPaise; // default/marketing
  if (base <= 0) return 0;
  const markup = Math.max(0, s.walletMarkupPercent || 0);
  return Math.round(base * (1 + markup / 100));
}
