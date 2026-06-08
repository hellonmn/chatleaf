import { headers } from "next/headers";

/**
 * The base URL the user is actually visiting, derived from request headers.
 * Works behind a tunnel (ngrok) and on localhost alike — so the webhook URL we
 * show, and any absolute links, match the host in the browser instead of a
 * hard-coded NEXTAUTH_URL.
 */
export async function getRequestBaseUrl(): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
