"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { encryptSecret } from "@watool/wa";
import { slidesSchema } from "@/lib/spotlight-types";
import { PLANS } from "@watool/types";
import { requirePlatformAdmin, getPlatformAdmin } from "@/lib/platform";
import { IMPERSONATE_ORG_COOKIE } from "@/lib/session";
import { logAdminAction } from "@/lib/audit";
import { slugify } from "@/lib/slug";

const orgIdSchema = z.object({ orgId: z.string().min(1) });

/** Change an org's plan. Platform admins only. */
export async function setOrgPlanAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = z
    .object({ orgId: z.string().min(1), plan: z.enum(PLANS) })
    .safeParse({ orgId: formData.get("orgId"), plan: formData.get("plan") });
  if (!parsed.success) return;

  const before = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { name: true, plan: true },
  });
  if (!before) return;
  if (before.plan === parsed.data.plan) return; // no-op

  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { plan: parsed.data.plan },
  });
  await logAdminAction({
    actor,
    action: "org.plan.change",
    targetType: "org",
    targetId: parsed.data.orgId,
    targetLabel: before.name,
    metadata: { from: before.plan, to: parsed.data.plan },
  });
  revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
  revalidatePath("/admin/orgs");
}

/** Save internal platform-admin notes on an org (never shown to the org). */
export async function setOrgNotesAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = z
    .object({ orgId: z.string().min(1), notes: z.string().max(5000) })
    .safeParse({ orgId: formData.get("orgId"), notes: formData.get("notes") ?? "" });
  if (!parsed.success) return;

  const notes = parsed.data.notes.trim();
  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { adminNotes: notes || null },
  });
  await logAdminAction({
    actor,
    action: "org.notes.update",
    targetType: "org",
    targetId: parsed.data.orgId,
  });
  revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
}

export type EditOrgState = { error?: string; ok?: string } | undefined;

/** Edit an org's name, slug, and seat-limit override. Platform admins only. */
export async function updateOrgAction(
  _prev: EditOrgState,
  formData: FormData,
): Promise<EditOrgState> {
  const actor = await requirePlatformAdmin();
  const parsed = z
    .object({
      orgId: z.string().min(1),
      name: z.string().trim().min(1, "Name is required.").max(100),
      slug: z.string().trim().max(40),
      seatOverride: z.string().trim(),
      gstin: z.string().trim().max(20).optional(),
    })
    .safeParse({
      orgId: formData.get("orgId"),
      name: formData.get("name"),
      slug: formData.get("slug"),
      seatOverride: formData.get("seatOverride") ?? "",
      gstin: formData.get("gstin") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const slug = slugify(parsed.data.slug || parsed.data.name);
  if (!slug) return { error: "Could not derive a valid slug." };

  // Seat override: blank = clear (use plan default); otherwise a positive int.
  let seatLimitOverride: number | null = null;
  if (parsed.data.seatOverride) {
    const n = Number(parsed.data.seatOverride);
    if (!Number.isInteger(n) || n < 1) {
      return { error: "Seat override must be a whole number ≥ 1, or blank." };
    }
    seatLimitOverride = n;
  }

  // Slug must stay unique across orgs.
  const clash = await prisma.org.findFirst({
    where: { slug, NOT: { id: parsed.data.orgId } },
    select: { id: true },
  });
  if (clash) return { error: `The slug “${slug}” is already taken.` };

  await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { name: parsed.data.name, slug, seatLimitOverride, gstin: parsed.data.gstin || null },
  });
  await logAdminAction({
    actor,
    action: "org.update",
    targetType: "org",
    targetId: parsed.data.orgId,
    targetLabel: parsed.data.name,
    metadata: { slug, seatLimitOverride },
  });
  revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
  return { ok: "Saved." };
}

export type PlatformSettingsState = { error?: string; ok?: string } | undefined;

const PLATFORM_SETTINGS_ID = "global";

/** Save global branding + feature flags (singleton). Platform admins only. */
export async function savePlatformSettingsAction(
  _prev: PlatformSettingsState,
  formData: FormData,
): Promise<PlatformSettingsState> {
  const actor = await requirePlatformAdmin();
  const brandName = String(formData.get("brandName") ?? "").trim() || "Chatleaf";
  const supportEmail = String(formData.get("supportEmail") ?? "").trim() || null;
  if (supportEmail && !z.string().email().safeParse(supportEmail).success) {
    return { error: "Enter a valid support email." };
  }
  const on = (name: string) => formData.get(name) === "on";
  const gstPercentRaw = Number(formData.get("gstPercent"));

  const fwdUrl = String(formData.get("webhookForwardUrl") ?? "").trim();
  if (on("webhookForwardEnabled") && fwdUrl && !z.string().url().safeParse(fwdUrl).success) {
    return { error: "Webhook forward URL must be a valid http(s) URL." };
  }

  // Secrets: a blank input keeps the existing value (they're never shown back).
  const existing = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  const keepSecret = (field: string, current: string | null | undefined) => {
    const v = String(formData.get(field) ?? "").trim();
    return v ? encryptSecret(v) : current ?? null;
  };
  const mode = formData.get("razorpayMode") === "live" ? "live" : "test";

  const data = {
    brandName,
    supportEmail,
    signupsEnabled: on("signupsEnabled"),
    broadcastsEnabled: on("broadcastsEnabled"),
    flowsEnabled: on("flowsEnabled"),
    templatesEnabled: on("templatesEnabled"),
    aiEnabled: on("aiEnabled"),
    companyName: String(formData.get("companyName") ?? "").trim() || null,
    companyAddress: String(formData.get("companyAddress") ?? "").trim() || null,
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    gstPercent: Number.isFinite(gstPercentRaw) && gstPercentRaw >= 0 && gstPercentRaw <= 100 ? Math.round(gstPercentRaw) : 18,
    invoicePrefix: String(formData.get("invoicePrefix") ?? "").trim() || "INV",
    razorpayMode: mode,
    razorpayTestKeyId: String(formData.get("razorpayTestKeyId") ?? "").trim() || null,
    razorpayTestKeySecretEnc: keepSecret("razorpayTestKeySecret", existing?.razorpayTestKeySecretEnc),
    razorpayTestWebhookSecretEnc: keepSecret("razorpayTestWebhookSecret", existing?.razorpayTestWebhookSecretEnc),
    razorpayLiveKeyId: String(formData.get("razorpayLiveKeyId") ?? "").trim() || null,
    razorpayLiveKeySecretEnc: keepSecret("razorpayLiveKeySecret", existing?.razorpayLiveKeySecretEnc),
    razorpayLiveWebhookSecretEnc: keepSecret("razorpayLiveWebhookSecret", existing?.razorpayLiveWebhookSecretEnc),
    metaAppId: String(formData.get("metaAppId") ?? "").trim() || null,
    metaVerifyToken: String(formData.get("metaVerifyToken") ?? "").trim() || null,
    metaAppSecretEnc: keepSecret("metaAppSecret", existing?.metaAppSecretEnc),
    metaSkipSignatureCheck: on("metaSkipSignatureCheck"),
    webhookForwardEnabled: on("webhookForwardEnabled"),
    webhookForwardUrl: String(formData.get("webhookForwardUrl") ?? "").trim() || null,
    webhookForwardHeaderName: String(formData.get("webhookForwardHeaderName") ?? "").trim() || null,
    webhookForwardHeaderValue: String(formData.get("webhookForwardHeaderValue") ?? "").trim() || null,
  };

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...data },
    update: data,
  });
  await logAdminAction({
    actor,
    action: "platform.settings",
    targetType: "user",
    targetId: actor.userId,
    metadata: { brandName, razorpayMode: mode },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: "Settings saved." };
}

export type LogoState = { error?: string; ok?: string } | undefined;
const MAX_LOGO_BYTES = 512 * 1024;

/** Upload a brand logo (stored as a data URL on PlatformSettings). */
export async function uploadLogoAction(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  await requirePlatformAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick an image file." };
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  if (file.size > MAX_LOGO_BYTES) return { error: "Logo must be under 512 KB — please compress it." };

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, logoUrl: dataUrl },
    update: { logoUrl: dataUrl },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: "Logo updated." };
}

/** Remove the brand logo (revert to the wordmark / brand name). */
export async function removeLogoAction(): Promise<void> {
  await requirePlatformAdmin();
  await prisma.platformSettings.updateMany({ data: { logoUrl: null } });
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
}

export type PlanConfigState = { error?: string; ok?: string } | undefined;

/** Save pricing + limits + Razorpay plan id for one tier. Platform admins only. */
export async function savePlanConfigAction(
  _prev: PlanConfigState,
  formData: FormData,
): Promise<PlanConfigState> {
  const actor = await requirePlatformAdmin();
  const num = z.coerce.number().int();
  const parsed = z
    .object({
      plan: z.enum(PLANS),
      priceInr: num.min(0),
      seats: num.min(1),
      contacts: num.min(0),
      messagesPerMonth: num.min(0),
      publishedFlows: num.min(0),
      trialDays: num.min(0).max(365),
      razorpayPlanId: z.string().trim().max(100).optional(),
    })
    .safeParse({
      plan: formData.get("plan"),
      priceInr: formData.get("priceInr"),
      seats: formData.get("seats"),
      contacts: formData.get("contacts"),
      messagesPerMonth: formData.get("messagesPerMonth"),
      publishedFlows: formData.get("publishedFlows"),
      trialDays: formData.get("trialDays") ?? 0,
      razorpayPlanId: formData.get("razorpayPlanId") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid plan values." };
  }
  const d = parsed.data;
  const data = {
    priceInr: d.priceInr,
    seats: d.seats,
    contacts: d.contacts,
    messagesPerMonth: d.messagesPerMonth,
    publishedFlows: d.publishedFlows,
    trialDays: d.trialDays,
    razorpayPlanId: d.razorpayPlanId || null,
    active: formData.get("active") === "on",
  };
  await prisma.planConfig.upsert({
    where: { plan: d.plan },
    create: { plan: d.plan, ...data },
    update: data,
  });
  await logAdminAction({
    actor,
    action: "plan.config",
    targetType: "user",
    targetId: actor.userId,
    targetLabel: d.plan,
    metadata: { plan: d.plan, priceInr: d.priceInr },
  });
  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/settings/billing");
  return { ok: `${d.plan} plan saved.` };
}

export type CouponState = { error?: string; ok?: string } | undefined;

/** Create or update a discount code (keyed by code). Platform admins only. */
export async function saveCouponAction(
  _prev: CouponState,
  formData: FormData,
): Promise<CouponState> {
  const actor = await requirePlatformAdmin();
  const parsed = z
    .object({
      code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Code: letters, numbers, - or _ only."),
      razorpayOfferId: z.string().trim().max(100).optional(),
      description: z.string().trim().max(200).optional(),
      maxRedemptions: z.coerce.number().int().min(1).optional().or(z.literal("").transform(() => undefined)),
      expiresAt: z.string().trim().optional(),
    })
    .safeParse({
      code: formData.get("code"),
      razorpayOfferId: formData.get("razorpayOfferId") ?? "",
      description: formData.get("description") ?? "",
      maxRedemptions: formData.get("maxRedemptions") ?? "",
      expiresAt: formData.get("expiresAt") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid coupon." };

  const code = parsed.data.code.toUpperCase();
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { error: "Invalid expiry date." };

  const data = {
    razorpayOfferId: parsed.data.razorpayOfferId || null,
    description: parsed.data.description || null,
    maxRedemptions: parsed.data.maxRedemptions ?? null,
    expiresAt,
    active: true,
  };
  await prisma.coupon.upsert({
    where: { code },
    create: { code, ...data },
    update: data,
  });
  await logAdminAction({
    actor,
    action: "coupon.save",
    targetType: "user",
    targetId: actor.userId,
    targetLabel: code,
  });
  revalidatePath("/admin/coupons");
  return { ok: `Coupon ${code} saved.` };
}

/** Toggle a coupon active/inactive. */
export async function toggleCouponAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const id = String(formData.get("couponId") ?? "");
  const value = formData.get("value") === "true";
  if (!id) return;
  await prisma.coupon.update({ where: { id }, data: { active: value } });
  revalidatePath("/admin/coupons");
}

/** Delete a coupon. */
export async function deleteCouponAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get("couponId") ?? "");
  if (!id) return;
  const c = await prisma.coupon.findUnique({ where: { id }, select: { code: true } });
  await prisma.coupon.delete({ where: { id } }).catch(() => {});
  await logAdminAction({
    actor,
    action: "coupon.delete",
    targetType: "user",
    targetId: actor.userId,
    targetLabel: c?.code,
  });
  revalidatePath("/admin/coupons");
}

/** Remove the global announcement banner entirely. */
export async function deleteAnnouncementAction(): Promise<void> {
  await requirePlatformAdmin();
  await prisma.platformAnnouncement.deleteMany({ where: { id: "global" } });
  revalidatePath("/admin/announcement");
  revalidatePath("/dashboard");
}

export type SpotlightState = { error?: string; ok?: string } | undefined;

/** Save the "what's new" spotlight deck. `publish` bumps the version so every
 *  user sees it again on next login. */
export async function saveSpotlightAction(
  _prev: SpotlightState,
  formData: FormData,
): Promise<SpotlightState> {
  const actor = await requirePlatformAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("slides") ?? "[]"));
  } catch {
    return { error: "Could not read the slides." };
  }
  const parsed = slidesSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `Check your slides — ${parsed.error.errors[0]?.message ?? "invalid"}.` };
  }
  if (parsed.data.some((s) => !s.title.trim())) {
    return { error: "Every slide needs a title." };
  }

  const active = formData.get("active") === "on";
  const publish = formData.get("publish") === "on";
  const existing = await prisma.spotlight.findUnique({ where: { id: "global" } });
  const version = publish ? (existing?.version ?? 0) + 1 : existing?.version ?? 1;
  const data = {
    active,
    version,
    slidesJSON: parsed.data as unknown as Prisma.InputJsonValue,
  };
  await prisma.spotlight.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
  await logAdminAction({
    actor,
    action: "spotlight.save",
    targetType: "user",
    targetId: actor.userId,
    metadata: { active, version, slides: parsed.data.length, published: publish },
  });
  revalidatePath("/admin/spotlight");
  revalidatePath("/dashboard");
  return {
    ok: publish ? `Published — every user will see it on next login (v${version}).` : "Saved.",
  };
}

export type AnnouncementState = { error?: string; ok?: string } | undefined;

const ANNOUNCEMENT_ID = "global";

/** Create/update the single global announcement banner. */
export async function setAnnouncementAction(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const actor = await requirePlatformAdmin();
  const parsed = z
    .object({
      message: z.string().trim().max(500),
      level: z.enum(["info", "warning"]),
      active: z.enum(["on", "off"]),
    })
    .safeParse({
      message: formData.get("message") ?? "",
      level: formData.get("level") ?? "info",
      active: formData.get("active") === "on" ? "on" : "off",
    });
  if (!parsed.success) return { error: "Invalid input." };

  const active = parsed.data.active === "on";
  if (active && !parsed.data.message) {
    return { error: "Add a message before enabling the banner." };
  }

  await prisma.platformAnnouncement.upsert({
    where: { id: ANNOUNCEMENT_ID },
    create: {
      id: ANNOUNCEMENT_ID,
      message: parsed.data.message,
      level: parsed.data.level,
      active,
    },
    update: { message: parsed.data.message, level: parsed.data.level, active },
  });
  await logAdminAction({
    actor,
    action: "platform.announcement",
    targetType: "user", // platform-level; reuse "user" target with self id
    targetId: actor.userId,
    metadata: { active, level: parsed.data.level },
  });
  revalidatePath("/admin/announcement");
  revalidatePath("/dashboard");
  return { ok: active ? "Banner published." : "Banner saved (hidden)." };
}

/** Suspend an org — its members get locked out of the app. */
export async function suspendOrgAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = orgIdSchema.safeParse({ orgId: formData.get("orgId") });
  if (!parsed.success) return;

  const org = await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { suspendedAt: new Date() },
    select: { name: true },
  });
  await logAdminAction({
    actor,
    action: "org.suspend",
    targetType: "org",
    targetId: parsed.data.orgId,
    targetLabel: org.name,
  });
  revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
  revalidatePath("/admin/orgs");
}

/** Lift a suspension. */
export async function unsuspendOrgAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = orgIdSchema.safeParse({ orgId: formData.get("orgId") });
  if (!parsed.success) return;

  const org = await prisma.org.update({
    where: { id: parsed.data.orgId },
    data: { suspendedAt: null },
    select: { name: true },
  });
  await logAdminAction({
    actor,
    action: "org.unsuspend",
    targetType: "org",
    targetId: parsed.data.orgId,
    targetLabel: org.name,
  });
  revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
  revalidatePath("/admin/orgs");
}

/**
 * Permanently delete an org and everything it owns (cascades). Irreversible.
 * The UI guards this with a typed confirmation.
 */
export async function deleteOrgAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = orgIdSchema.safeParse({ orgId: formData.get("orgId") });
  if (!parsed.success) return;

  const org = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { name: true, plan: true },
  });
  if (!org) return;

  await prisma.org.delete({ where: { id: parsed.data.orgId } });
  // Log AFTER a successful delete (the row has no FK, so it survives).
  await logAdminAction({
    actor,
    action: "org.delete",
    targetType: "org",
    targetId: parsed.data.orgId,
    targetLabel: org.name,
    metadata: { plan: org.plan },
  });
  redirect("/admin/orgs");
}

export type AdminActionState = { error?: string; ok?: string } | undefined;

/**
 * Grant platform-admin rights to an existing user by email. The person must
 * have signed up already (we never create a login here). Used by the form at
 * the top of /admin/users so admins can be added without editing env/DB.
 */
export async function addPlatformAdminByEmailAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requirePlatformAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return {
      error: "No account with that email yet. Ask them to sign up first, then add them.",
    };
  }
  if (user.isPlatformAdmin) {
    return { ok: `${email} is already a platform admin.` };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformAdmin: true },
  });
  await logAdminAction({
    actor,
    action: "user.admin.grant",
    targetType: "user",
    targetId: user.id,
    targetLabel: email,
  });
  revalidatePath("/admin/users");
  return { ok: `${email} is now a platform admin.` };
}

/** Grant or revoke platform-admin rights for a user. */
export async function setPlatformAdminAction(formData: FormData): Promise<void> {
  const me = await requirePlatformAdmin();
  const parsed = z
    .object({ userId: z.string().min(1), value: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), value: formData.get("value") });
  if (!parsed.success) return;

  // Don't let an admin revoke their own access (avoids accidental lockout).
  if (parsed.data.userId === me.userId && parsed.data.value === "false") return;

  const grant = parsed.data.value === "true";
  const user = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { isPlatformAdmin: grant },
    select: { email: true },
  });
  await logAdminAction({
    actor: me,
    action: grant ? "user.admin.grant" : "user.admin.revoke",
    targetType: "user",
    targetId: parsed.data.userId,
    targetLabel: user.email,
  });
  revalidatePath("/admin/users");
}

export type ResetPasswordState =
  | { error?: string; ok?: string; password?: string }
  | undefined;

/**
 * Force-reset a user's password to a freshly generated one and return it ONCE
 * so the admin can relay it (there's no email delivery yet). Platform admins only.
 */
export async function resetUserPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const actor = await requirePlatformAdmin();
  const parsed = z.object({ userId: z.string().min(1) }).safeParse({
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "User not found." };

  // url-safe, ~16 chars, easy to copy/paste.
  const password = randomBytes(12).toString("base64url").slice(0, 16);
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await logAdminAction({
    actor,
    action: "user.password.reset",
    targetType: "user",
    targetId: user.id,
    targetLabel: user.email,
  });
  return { ok: `New password set for ${user.email}.`, password };
}

/** Deactivate or reactivate a user's login. */
export async function setUserDisabledAction(formData: FormData): Promise<void> {
  const me = await requirePlatformAdmin();
  const parsed = z
    .object({ userId: z.string().min(1), value: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), value: formData.get("value") });
  if (!parsed.success) return;

  // Never let an admin lock themselves out.
  if (parsed.data.userId === me.userId && parsed.data.value === "true") return;

  const disable = parsed.data.value === "true";
  const user = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { disabledAt: disable ? new Date() : null },
    select: { email: true },
  });
  await logAdminAction({
    actor: me,
    action: disable ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: parsed.data.userId,
    targetLabel: user.email,
  });
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  revalidatePath("/admin/users");
}

/**
 * Permanently delete a user (cascades their memberships). Irreversible. Note:
 * this does NOT delete orgs the user owns — those remain (possibly ownerless),
 * so prefer suspending/transferring first. UI guards with a typed confirm.
 */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const me = await requirePlatformAdmin();
  const parsed = z.object({ userId: z.string().min(1) }).safeParse({
    userId: formData.get("userId"),
  });
  if (!parsed.success) return;
  if (parsed.data.userId === me.userId) return; // can't delete yourself

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { email: true },
  });
  if (!user) return;

  await prisma.user.delete({ where: { id: parsed.data.userId } });
  await logAdminAction({
    actor: me,
    action: "user.delete",
    targetType: "user",
    targetId: parsed.data.userId,
    targetLabel: user.email,
  });
  redirect("/admin/users");
}

/** Start impersonating an org — view the dashboard as that workspace. */
export async function impersonateOrgAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const parsed = orgIdSchema.safeParse({ orgId: formData.get("orgId") });
  if (!parsed.success) return;

  const org = await prisma.org.findUnique({
    where: { id: parsed.data.orgId },
    select: { id: true, name: true },
  });
  if (!org) return;

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_ORG_COOKIE, org.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
  await logAdminAction({
    actor,
    action: "org.impersonate.start",
    targetType: "org",
    targetId: org.id,
    targetLabel: org.name,
  });
  redirect("/dashboard");
}

/** Stop impersonating and return to the admin console. */
export async function stopImpersonatingAction(): Promise<void> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(IMPERSONATE_ORG_COOKIE)?.value;
  cookieStore.delete(IMPERSONATE_ORG_COOKIE);

  // Best-effort audit (this action isn't gated, so resolve the actor softly).
  if (orgId) {
    const actor = await getPlatformAdmin();
    if (actor) {
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { name: true },
      });
      await logAdminAction({
        actor,
        action: "org.impersonate.stop",
        targetType: "org",
        targetId: orgId,
        targetLabel: org?.name ?? null,
      });
    }
  }
  redirect("/admin/orgs");
}
