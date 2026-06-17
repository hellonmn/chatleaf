import { cookies } from "next/headers";

/**
 * The "active channel" = a connected WhatsApp number the user is focused on.
 * Stored in a cookie (the PhoneNumber row id). Null = all channels.
 * Inbox queries are always org-scoped too, so a stale/foreign id just yields
 * nothing rather than leaking data.
 */
export const ACTIVE_CHANNEL_COOKIE = "watool_active_channel";

export async function getActiveChannelId(): Promise<string | null> {
  const v = (await cookies()).get(ACTIVE_CHANNEL_COOKIE)?.value;
  return v && v !== "all" ? v : null;
}
