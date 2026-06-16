"use server";

import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";

/** Mark the current spotlight version as seen for this user (so it won't reshow). */
export async function dismissSpotlightAction(): Promise<void> {
  const ctx = await requireActiveContext();
  const sp = await prisma.spotlight.findUnique({
    where: { id: "global" },
    select: { version: true },
  });
  if (!sp) return;
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { spotlightSeenVersion: sp.version },
  });
}
