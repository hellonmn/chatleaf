"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type SettingsState = { error?: string; ok?: string } | undefined;

/** Save (or clear, if blank) the org's Claude API key — stored encrypted. */
export async function saveAiKeyAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can change this." };
  }

  const key = String(formData.get("apiKey") ?? "").trim();
  if (key && !key.startsWith("sk-ant-")) {
    return { error: "That doesn't look like a Claude API key (expected sk-ant-…)." };
  }

  await prisma.orgSettings.upsert({
    where: { orgId: ctx.orgId },
    create: { orgId: ctx.orgId, aiApiKeyEnc: key ? encryptSecret(key) : null },
    update: { aiApiKeyEnc: key ? encryptSecret(key) : null },
  });
  revalidatePath("/dashboard/settings/ai");
  return { ok: key ? "Claude API key saved." : "Claude API key removed." };
}

const dayCfg = z.object({
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});
const hoursSchema = z.record(
  z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  dayCfg,
);

/** Save the org's business hours, timezone, and away auto-reply. */
export async function saveBusinessHoursAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can change this." };
  }

  const timezone = String(formData.get("timezone") ?? "Asia/Kolkata");
  const awayEnabled = ["on", "true"].includes(String(formData.get("awayEnabled") ?? ""));
  const autoAssign = ["on", "true"].includes(String(formData.get("autoAssign") ?? ""));
  const awayMessage =
    String(formData.get("awayMessage") ?? "").trim().slice(0, 1024) ||
    "Thanks for your message! We'll reply during business hours.";

  let hours: z.infer<typeof hoursSchema> = {};
  const raw = formData.get("hours");
  if (typeof raw === "string" && raw.trim()) {
    const parsed = hoursSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { error: "Invalid business hours." };
    hours = parsed.data;
  }

  await prisma.orgSettings.upsert({
    where: { orgId: ctx.orgId },
    create: {
      orgId: ctx.orgId,
      timezone,
      awayEnabled,
      awayMessage,
      autoAssign,
      hoursJSON: hours as Prisma.InputJsonValue,
    },
    update: {
      timezone,
      awayEnabled,
      awayMessage,
      autoAssign,
      hoursJSON: hours as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dashboard/settings/hours");
  return { ok: "Business hours saved." };
}
