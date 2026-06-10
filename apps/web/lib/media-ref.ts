// Client-safe media helpers. Mirrors @watool/wa's extractMediaRef but lives in
// the web app so client components never import the @watool/wa barrel (which
// re-exports node:crypto modules and would break the browser/webpack build).

export type MediaKind = "image" | "video" | "audio" | "document";

export type MediaRef = {
  kind: MediaKind | "sticker";
  /** Meta media id (inbound + agent uploads) — served via the auth proxy. */
  id?: string;
  /** Public link (flow sendMessage by URL) — rendered directly. */
  link?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
};

/**
 * Pull a media reference out of a stored Message.payload. Works for inbound
 * (Meta's shape, by `id`), agent uploads (by `id`), and flow media (by `link`).
 */
export function extractMediaRef(payload: unknown): MediaRef | null {
  const p = payload as Record<string, any> | null;
  if (!p || typeof p !== "object") return null;
  for (const kind of ["image", "document", "video", "audio", "sticker"] as const) {
    const m = p[kind];
    if (!m || typeof m !== "object") continue;
    if (typeof m.id === "string") {
      return { kind, id: m.id, mimeType: m.mime_type, filename: m.filename, caption: m.caption };
    }
    if (typeof m.link === "string") {
      return { kind, link: m.link, mimeType: m.mime_type, filename: m.filename, caption: m.caption };
    }
  }
  return null;
}
