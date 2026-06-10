"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type SettingsState = { error?: string; ok?: string } | undefined;

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
      hoursJSON: hours as Prisma.InputJsonValue,
    },
    update: {
      timezone,
      awayEnabled,
      awayMessage,
      hoursJSON: hours as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dashboard/settings/hours");
  return { ok: "Business hours saved." };
}
