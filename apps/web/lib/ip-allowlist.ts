/**
 * Optional IP allowlist for the /admin area. Pure + edge-safe (no node imports)
 * so both middleware (edge) and the server-side gate can use it.
 *
 * ADMIN_IP_ALLOWLIST = comma-separated exact IPs. Empty/unset = unrestricted
 * (so you can't accidentally lock yourself out before configuring it).
 */
export function isAdminIpAllowed(ip: string | null): boolean {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  if (!ip) return false;
  return list.includes(ip);
}

/** First IP from x-forwarded-for, falling back to x-real-ip. */
export function ipFromHeaders(xff: string | null, realIp?: string | null): string | null {
  return xff?.split(",")[0]?.trim() || realIp || null;
}
