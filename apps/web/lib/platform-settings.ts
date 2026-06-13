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
  };
});
