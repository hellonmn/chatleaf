"use server";

import { cookies } from "next/headers";
import { ACTIVE_CHANNEL_COOKIE } from "@/lib/active-channel";

/** Set (or clear, when "all") the active WhatsApp channel. */
export async function setActiveChannelAction(channelId: string): Promise<void> {
  const store = await cookies();
  if (!channelId || channelId === "all") {
    store.delete(ACTIVE_CHANNEL_COOKIE);
  } else {
    store.set(ACTIVE_CHANNEL_COOKIE, channelId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}
