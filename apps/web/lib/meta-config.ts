import { cache } from "react";
import { prisma } from "@watool/db";
import { decryptSecret } from "@watool/wa";

/**
 * Meta/WhatsApp webhook config — admin-set (DB, secret encrypted) over env
 * fallback. Used by the webhook route so the verify token / app secret can be
 * configured from the admin panel instead of env on the host.
 */
export const getMetaWebhookConfig = cache(async () => {
  const s = await prisma.platformSettings.findUnique({
    where: { id: "global" },
    select: {
      metaAppId: true, metaVerifyToken: true, metaAppSecretEnc: true, metaSkipSignatureCheck: true,
      webhookForwardEnabled: true, webhookForwardUrl: true,
      webhookForwardHeaderName: true, webhookForwardHeaderValue: true,
    },
  });
  return {
    appId: s?.metaAppId || process.env.META_APP_ID || null,
    verifyToken: s?.metaVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || null,
    appSecret: s?.metaAppSecretEnc
      ? decryptSecret(s.metaAppSecretEnc)
      : process.env.META_APP_SECRET || null,
    skipSignatureCheck: s?.metaSkipSignatureCheck || process.env.META_SKIP_SIGNATURE_CHECK === "true",
    // Webhook relay to a second platform (DB over env).
    forwardEnabled: s?.webhookForwardEnabled ?? (process.env.WEBHOOK_FORWARD_URL ? true : false),
    forwardUrl: s?.webhookForwardUrl || process.env.WEBHOOK_FORWARD_URL || null,
    forwardHeaderName: s?.webhookForwardHeaderName || process.env.WEBHOOK_FORWARD_HEADER_NAME || null,
    forwardHeaderValue: s?.webhookForwardHeaderValue || process.env.WEBHOOK_FORWARD_HEADER_VALUE || null,
  };
});
