import { cookies } from "next/headers";
import { prisma } from "@watool/db";

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

/**
 * Resolve the WhatsApp account (WABA) for the active channel: the account that
 * owns the active phone number, or — when no specific channel is selected — the
 * org's first account. Returns null if the org has no connected number.
 */
export async function getActiveAccount(orgId: string) {
  const channelId = await getActiveChannelId();
  if (channelId) {
    const pn = await prisma.phoneNumber.findFirst({
      where: { id: channelId, account: { orgId } },
      include: { account: true },
    });
    if (pn) return pn.account;
  }
  return prisma.whatsAppAccount.findFirst({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });
}
