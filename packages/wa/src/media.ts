/**
 * WhatsApp media helpers.
 *
 * Inbound media arrives as a media ID (not the bytes). To show it we resolve the
 * ID to a short-lived Meta URL, then download it WITH the access token (Meta's
 * media URLs require auth). Outbound media is uploaded to Meta first to get an
 * ID, then sent by ID. We keep the bytes server-side only (proxied), never
 * exposing the token to the browser.
 */
const GRAPH = "https://graph.facebook.com";

function version(v?: string): string {
  return v ?? process.env.META_GRAPH_API_VERSION ?? "v21.0";
}

/** The four WhatsApp media message kinds we support. */
export type MediaKind = "image" | "document" | "video" | "audio";

/** Map a MIME type to the WhatsApp media kind. */
export function mediaKindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

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

/** Resolve a media ID to its (short-lived) download URL + mime type. */
export async function getMediaUrl(
  mediaId: string,
  accessToken: string,
  v?: string,
): Promise<{ url: string; mimeType: string; fileSize?: number }> {
  const res = await fetch(`${GRAPH}/${version(v)}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to resolve media ${mediaId} (${res.status})`);
  const json = (await res.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!json.url) throw new Error("Media URL missing in Meta response.");
  return { url: json.url, mimeType: json.mime_type ?? "application/octet-stream", fileSize: json.file_size };
}

/** Download media bytes from a Meta media URL (requires the access token). */
export async function downloadMedia(
  mediaUrl: string,
  accessToken: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: await res.arrayBuffer(), contentType };
}

/** Upload media to Meta and return the media ID (for sending by ID). */
export async function uploadMedia(opts: {
  phoneNumberId: string;
  accessToken: string;
  data: Uint8Array;
  mimeType: string;
  filename?: string;
  version?: string;
}): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", opts.mimeType);
  // Uint8Array is a valid Blob part at runtime; this package compiles without
  // the DOM lib, so cast to satisfy the type checker.
  const blob = new Blob([opts.data as unknown as ArrayBuffer], { type: opts.mimeType });
  form.append("file", blob, opts.filename ?? "upload");

  const res = await fetch(`${GRAPH}/${version(opts.version)}/${opts.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json?.error?.message ?? `Media upload failed (${res.status})`);
  }
  return json.id;
}
