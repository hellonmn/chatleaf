"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { getRazorpayCreds, razorpayConfigured, createRazorpayOrder, verifyOrderPayment } from "@/lib/razorpay";
import { creditWallet } from "@/lib/wallet";
import { createInvoiceForCharge } from "@/lib/invoices";

export type TopupStart =
  | { error?: string; orderId?: string; keyId?: string; amountPaise?: number }
  | undefined;

const MIN_INR = 100; // ₹100 minimum top-up
const MAX_INR = 100_000; // ₹1,00,000 per transaction

/** Start a wallet top-up: create a Razorpay order for `amountInr`. */
export async function createWalletTopupAction(amountInr: number): Promise<TopupStart> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "Only owners and admins can add funds." };
  if (!(await razorpayConfigured())) return { error: "Payments aren't configured yet." };

  const inr = Math.floor(Number(amountInr));
  if (!Number.isFinite(inr) || inr < MIN_INR) return { error: `Minimum top-up is ₹${MIN_INR}.` };
  if (inr > MAX_INR) return { error: `Maximum per top-up is ₹${MAX_INR.toLocaleString("en-IN")}.` };
  const amountPaise = inr * 100;

  try {
    const order = await createRazorpayOrder({
      amountPaise,
      notes: { orgId: ctx.orgId, purpose: "wallet_topup" },
    });
    const { keyId } = await getRazorpayCreds();
    return { orderId: order.id, keyId: keyId ?? undefined, amountPaise };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start top-up." };
  }
}

export type TopupConfirm = { error?: string; ok?: string; balancePaise?: number; invoiceId?: string };

/** Confirm a wallet top-up after Checkout succeeds: verify the signature, then
 *  credit the wallet (idempotent on the Razorpay payment id) + issue an invoice. */
export async function confirmWalletTopupAction(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
  amountPaise: number;
}): Promise<TopupConfirm> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return { error: "Only owners and admins can add funds." };

  const ok = await verifyOrderPayment({
    orderId: opts.orderId,
    paymentId: opts.paymentId,
    signature: opts.signature,
  });
  if (!ok) return { error: "Payment could not be verified." };

  // Idempotency: never credit the same Razorpay payment twice.
  const existing = await prisma.walletTransaction.findFirst({
    where: { orgId: ctx.orgId, razorpayPaymentId: opts.paymentId },
  });
  if (existing) {
    return { ok: "Already credited.", balancePaise: existing.balanceAfterPaise };
  }

  const amountPaise = Math.max(0, Math.floor(opts.amountPaise));
  if (amountPaise <= 0) return { error: "Invalid amount." };

  const { balancePaise } = await creditWallet(ctx.orgId, amountPaise, {
    kind: "topup",
    note: `Wallet top-up of ₹${(amountPaise / 100).toLocaleString("en-IN")}`,
    refType: "razorpay",
    refId: opts.orderId,
    razorpayPaymentId: opts.paymentId,
  });

  const invoiceId = await createInvoiceForCharge({
    orgId: ctx.orgId,
    totalPaise: amountPaise,
    description: "Wallet top-up",
    razorpayPaymentId: opts.paymentId,
  });

  revalidatePath("/dashboard/settings/wallet");
  return {
    ok: `Added ₹${(amountPaise / 100).toLocaleString("en-IN")} to your wallet.`,
    balancePaise,
    invoiceId: invoiceId ?? undefined,
  };
}
