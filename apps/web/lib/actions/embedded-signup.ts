"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@watool/db";
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  getWabaPhoneNumbers,
  encryptSecret,
} from "@watool/wa";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ESResult = { error?: string; ok?: string };

const schema = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
});

/**
 * Complete Meta Embedded Signup: exchange the code for a token, subscribe our
 * app to the customer's WABA, fetch the number's details, and store it (token
 * encrypted). Called from the client once the Facebook popup returns.
 */
export async function completeEmbeddedSignupAction(
  input: unknown,
): Promise<ESResult> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can connect WhatsApp." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Incomplete signup data from Meta." };
  const { code, wabaId, phoneNumberId } = parsed.data;

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || appSecret.includes("REPLACE_WITH")) {
    return { error: "Embedded Signup isn't configured on the server (META_APP_ID / META_APP_SECRET)." };
  }

  // A WABA may not be claimed by a different org.
  const existingWaba = await prisma.whatsAppAccount.findUnique({ where: { wabaId } });
  if (existingWaba && existingWaba.orgId !== ctx.orgId) {
    return { error: "This WhatsApp Business Account is connected to another workspace." };
  }

  let token: string;
  try {
    token = await exchangeCodeForToken({ code, appId, appSecret });
    await subscribeAppToWaba({ wabaId, accessToken: token });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Meta authorization failed." };
  }

  // Pull the number's display details (best-effort).
  let displayNumber = phoneNumberId;
  let verifiedName: string | undefined;
  try {
    const numbers = await getWabaPhoneNumbers({ wabaId, accessToken: token });
    const match = numbers.find((n) => n.id === phoneNumberId) ?? numbers[0];
    if (match) {
      displayNumber = match.display_phone_number;
      verifiedName = match.verified_name;
    }
  } catch {
    /* keep the id as the display fallback */
  }

  const accessTokenEnc = encryptSecret(token);
  const account = await prisma.whatsAppAccount.upsert({
    where: { wabaId },
    create: { orgId: ctx.orgId, wabaId, accessTokenEnc, status: "CONNECTED" },
    update: { accessTokenEnc, status: "CONNECTED" },
  });

  await prisma.phoneNumber.upsert({
    where: { phoneNumberId },
    create: { whatsAppAccountId: account.id, phoneNumberId, displayNumber, verifiedName },
    update: { whatsAppAccountId: account.id, displayNumber, verifiedName },
  });

  revalidatePath("/dashboard/settings/whatsapp");
  return { ok: `Connected ${displayNumber}. Your number is live.` };
}
