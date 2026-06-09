import { auth } from "@/auth";
import { prisma } from "@watool/db";
import {
  decryptSecret,
  extractMediaRef,
  getMediaUrl,
  downloadMedia,
} from "@watool/wa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated media proxy. WhatsApp media lives behind Meta's auth, so we
 * fetch it server-side with the org's token and stream it to the browser.
 * Access is scoped: the caller must be a member of the message's org.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { messageId } = await params;
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return new Response("Not found", { status: 404 });

  // Tenant check: the user must belong to the message's org.
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, orgId: message.orgId },
  });
  if (!membership) return new Response("Forbidden", { status: 403 });

  const ref = extractMediaRef(message.payload);
  if (!ref) return new Response("No media on this message", { status: 404 });
  // Link-based media (flow sends) is public and rendered directly — not proxied.
  if (!ref.id) return new Response("Not a proxied media message", { status: 404 });

  const account = await prisma.whatsAppAccount.findFirst({
    where: { orgId: message.orgId },
  });
  if (!account?.accessTokenEnc) {
    return new Response("WhatsApp not connected", { status: 409 });
  }
  const token = decryptSecret(account.accessTokenEnc);

  try {
    const { url } = await getMediaUrl(ref.id, token);
    const { bytes, contentType } = await downloadMedia(url, token);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": ref.mimeType ?? contentType,
        // Private (per-user auth) but cacheable briefly to avoid re-fetching.
        "Cache-Control": "private, max-age=3600",
        ...(ref.filename
          ? { "Content-Disposition": `inline; filename="${ref.filename}"` }
          : {}),
      },
    });
  } catch (err) {
    console.error("[media] proxy failed:", err);
    return new Response("Media unavailable", { status: 502 });
  }
}
