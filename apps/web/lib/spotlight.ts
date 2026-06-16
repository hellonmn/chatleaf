import { prisma } from "@watool/db";
import { slidesSchema, type Slide } from "@/lib/spotlight-types";

/**
 * The active spotlight deck for a user, or null if there's nothing new to show
 * (inactive, empty, or already seen this version).
 */
export async function getActiveSpotlightForUser(
  userId: string,
): Promise<{ version: number; slides: Slide[] } | null> {
  const sp = await prisma.spotlight.findUnique({ where: { id: "global" } });
  if (!sp || !sp.active) return null;

  const parsed = slidesSchema.safeParse(sp.slidesJSON);
  if (!parsed.success || parsed.data.length === 0) return null;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { spotlightSeenVersion: true },
  });
  if ((me?.spotlightSeenVersion ?? 0) >= sp.version) return null;

  return { version: sp.version, slides: parsed.data };
}
