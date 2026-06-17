import { cache } from "react";
import { prisma } from "@watool/db";

/**
 * Global platform configuration (branding + feature flags). Read via a
 * request-cached singleton so many components can call it cheaply. Returns
 * sensible defaults when the row doesn't exist yet.
 */
export type PlatformSettings = {
  brandName: string;
  logoUrl: string | null;
  supportEmail: string | null;
  signupsEnabled: boolean;
  broadcastsEnabled: boolean;
  flowsEnabled: boolean;
  templatesEnabled: boolean;
  aiEnabled: boolean;
  companyName: string | null;
  companyAddress: string | null;
  gstin: string | null;
  gstPercent: number;
  invoicePrefix: string;
  razorpayMode: string;
  razorpayTestKeyId: string | null;
  razorpayTestKeySecretSet: boolean;
  razorpayTestWebhookSecretSet: boolean;
  razorpayLiveKeyId: string | null;
  razorpayLiveKeySecretSet: boolean;
  razorpayLiveWebhookSecretSet: boolean;
  metaVerifyToken: string | null;
  metaAppSecretSet: boolean;
  metaSkipSignatureCheck: boolean;
};

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  brandName: "Chatleaf",
  logoUrl: null,
  supportEmail: null,
  signupsEnabled: true,
  broadcastsEnabled: true,
  flowsEnabled: true,
  templatesEnabled: true,
  aiEnabled: true,
  companyName: null,
  companyAddress: null,
  gstin: null,
  gstPercent: 18,
  invoicePrefix: "INV",
  razorpayMode: "test",
  razorpayTestKeyId: null,
  razorpayTestKeySecretSet: false,
  razorpayTestWebhookSecretSet: false,
  razorpayLiveKeyId: null,
  razorpayLiveKeySecretSet: false,
  razorpayLiveWebhookSecretSet: false,
  metaVerifyToken: null,
  metaAppSecretSet: false,
  metaSkipSignatureCheck: false,
};

export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const row = await prisma.platformSettings.findUnique({ where: { id: "global" } });
  if (!row) return PLATFORM_SETTINGS_DEFAULTS;
  return {
    brandName: row.brandName,
    logoUrl: row.logoUrl,
    supportEmail: row.supportEmail,
    signupsEnabled: row.signupsEnabled,
    broadcastsEnabled: row.broadcastsEnabled,
    flowsEnabled: row.flowsEnabled,
    templatesEnabled: row.templatesEnabled,
    aiEnabled: row.aiEnabled,
    companyName: row.companyName,
    companyAddress: row.companyAddress,
    gstin: row.gstin,
    gstPercent: row.gstPercent,
    invoicePrefix: row.invoicePrefix,
    razorpayMode: row.razorpayMode,
    razorpayTestKeyId: row.razorpayTestKeyId,
    razorpayTestKeySecretSet: !!row.razorpayTestKeySecretEnc,
    razorpayTestWebhookSecretSet: !!row.razorpayTestWebhookSecretEnc,
    razorpayLiveKeyId: row.razorpayLiveKeyId,
    razorpayLiveKeySecretSet: !!row.razorpayLiveKeySecretEnc,
    razorpayLiveWebhookSecretSet: !!row.razorpayLiveWebhookSecretEnc,
    metaVerifyToken: row.metaVerifyToken,
    metaAppSecretSet: !!row.metaAppSecretEnc,
    metaSkipSignatureCheck: row.metaSkipSignatureCheck,
  };
});
