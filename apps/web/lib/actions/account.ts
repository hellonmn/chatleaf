"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@watool/db";
import { encryptSecret, decryptSecret } from "@watool/wa";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { generateTotpSecret, verifyTotp, otpauthUrl } from "@/lib/totp";

export type AccountState = { error?: string; ok?: string } | undefined;

/** Update the signed-in user's display name and email. */
export async function updateProfileAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const ctx = await requireActiveContext();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Name is required").max(100), email: z.string().email("Enter a valid email") })
    .safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { email, NOT: { id: ctx.userId } }, select: { id: true } });
  if (clash) return { error: "That email is already in use." };

  await prisma.user.update({ where: { id: ctx.userId }, data: { name: parsed.data.name, email } });
  revalidatePath("/dashboard/settings/account");
  return { ok: "Profile updated. (Email changes apply on next sign-in.)" };
}

/** Change the signed-in user's password (verifies the current one). */
export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const ctx = await requireActiveContext();
  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    })
    .safeParse({ currentPassword: formData.get("currentPassword"), newPassword: formData.get("newPassword") });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  return { ok: "Password changed." };
}

/** Begin 2FA enrollment: generate + store (encrypted) a secret, return the
 *  otpauth URL for the QR. Not enabled until confirmed with a valid code. */
export async function startTwoFactorAction(): Promise<{ secret: string; otpauthUrl: string }> {
  const ctx = await requireActiveContext();
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false },
  });
  const { brandName } = await getPlatformSettings();
  return { secret, otpauthUrl: otpauthUrl(secret, ctx.email, brandName) };
}

/** Confirm enrollment with a code from the authenticator app. */
export async function confirmTwoFactorAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const ctx = await requireActiveContext();
  const code = String(formData.get("code") ?? "").trim();
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user?.twoFactorSecret) return { error: "Start setup again." };
  if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return { error: "That code is incorrect. Try again." };
  }
  await prisma.user.update({ where: { id: ctx.userId }, data: { twoFactorEnabled: true } });
  revalidatePath("/dashboard/settings/account");
  return { ok: "Two-factor authentication is on." };
}

/** Disable 2FA (requires a valid current code). */
export async function disableTwoFactorAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const ctx = await requireActiveContext();
  const code = String(formData.get("code") ?? "").trim();
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return { error: "2FA isn't enabled." };
  if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return { error: "That code is incorrect." };
  }
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  revalidatePath("/dashboard/settings/account");
  return { ok: "Two-factor authentication is off." };
}
