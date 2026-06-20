"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ConnectValues = {
  wabaId?: string;
  phoneNumberId?: string;
  displayNumber?: string;
  verifiedName?: string;
};
export type ActionState =
  | { error?: string; ok?: string; values?: ConnectValues }
  | undefined;

const connectSchema = z.object({
  wabaId: z.string().trim().min(1, "WABA ID is required"),
  phoneNumberId: z.string().trim().min(1, "Phone number ID is required"),
  displayNumber: z.string().trim().min(1, "Display number is required"),
  verifiedName: z.string().trim().optional(),
  // Optional: on update, leave blank to keep the existing (encrypted) token.
  accessToken: z.string().trim().optional(),
});

/**
 * Connect (or update) a WhatsApp number for the active org. Token is encrypted
 * at rest and never returned to the client. Reconnecting the same number within
 * your own workspace is always allowed (it re-links / updates); only a number
 * already claimed by a DIFFERENT org is rejected.
 */
export async function connectWhatsAppAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can connect WhatsApp." };
  }

  const parsed = connectSchema.safeParse({
    wabaId: formData.get("wabaId"),
    phoneNumberId: formData.get("phoneNumberId"),
    displayNumber: formData.get("displayNumber"),
    verifiedName: formData.get("verifiedName") || undefined,
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  // Echo back the entered values so the form keeps them on error.
  const values: ConnectValues = {
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
    displayNumber: data.displayNumber,
    verifiedName: data.verifiedName,
  };

  // A WABA can't belong to two different orgs.
  const existingWaba = await prisma.whatsAppAccount.findUnique({
    where: { wabaId: data.wabaId },
  });
  if (existingWaba && existingWaba.orgId !== ctx.orgId) {
    return { error: "This WhatsApp Business Account is connected to another workspace.", values };
  }

  // Token: required on first connect; optional (keep existing) on update.
  let accessTokenEnc: string | undefined;
  if (data.accessToken) {
    if (data.accessToken.length < 10) {
      return { error: "Access token looks too short.", values };
    }
    accessTokenEnc = encryptSecret(data.accessToken);
  }
  if (!accessTokenEnc && !existingWaba?.accessTokenEnc) {
    return { error: "Access token is required to connect.", values };
  }

  const account = await prisma.whatsAppAccount.upsert({
    where: { wabaId: data.wabaId },
    create: {
      orgId: ctx.orgId,
      wabaId: data.wabaId,
      accessTokenEnc: accessTokenEnc!, // guaranteed present on create
      status: "CONNECTED",
    },
    update: {
      status: "CONNECTED",
      ...(accessTokenEnc ? { accessTokenEnc } : {}), // keep old token if blank
    },
  });

  // A phone number already claimed by ANOTHER org is a real conflict; within
  // your own org we simply (re-)link it to this account.
  const existingPn = await prisma.phoneNumber.findUnique({
    where: { phoneNumberId: data.phoneNumberId },
    include: { account: true },
  });
  if (existingPn && existingPn.account.orgId !== ctx.orgId) {
    return { error: "This phone number is connected to another workspace.", values };
  }

  await prisma.phoneNumber.upsert({
    where: { phoneNumberId: data.phoneNumberId },
    create: {
      whatsAppAccountId: account.id,
      phoneNumberId: data.phoneNumberId,
      displayNumber: data.displayNumber,
      verifiedName: data.verifiedName,
    },
    update: {
      whatsAppAccountId: account.id, // re-link within the same org
      displayNumber: data.displayNumber,
      verifiedName: data.verifiedName,
    },
  });

  revalidatePath("/dashboard/settings/whatsapp");
  return { ok: "WhatsApp number connected. Subscribe the webhook in Meta to go live." };
}

/**
 * Disconnect a WhatsApp account. Soft-delete: mark it DISCONNECTED (it stays
 * visible in the list so you can see it was removed), drop its access token, and
 * delete its message templates (they're WABA-specific and meaningless once
 * disconnected). Contacts and chat history are preserved.
 */
export async function disconnectWhatsAppAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) return;
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return;

  // Scoped to the org so you can't touch another tenant's account.
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: accountId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!account) return;

  await prisma.template.deleteMany({ where: { whatsAppAccountId: account.id } });
  await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: { status: "DISCONNECTED", accessTokenEnc: null },
  });
  revalidatePath("/dashboard/settings/whatsapp");
}
