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
    select: { metaVerifyToken: true, metaAppSecretEnc: true, metaSkipSignatureCheck: true },
  });
  return {
    verifyToken: s?.metaVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || null,
    appSecret: s?.metaAppSecretEnc
      ? decryptSecret(s.metaAppSecretEnc)
      : process.env.META_APP_SECRET || null,
    skipSignatureCheck: s?.metaSkipSignatureCheck || process.env.META_SKIP_SIGNATURE_CHECK === "true",
  };
});
