import { Globe } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { getRequestBaseUrl } from "@/lib/base-url";
import { getMetaWebhookConfig } from "@/lib/meta-config";
import { ChannelsManager, type Channel } from "./ChannelsManager";

export default async function WhatsAppSettingsPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { orgId: ctx.orgId },
    include: { phoneNumbers: true },
    orderBy: { createdAt: "asc" },
  });

  const channels: Channel[] = accounts.map((a) => ({
    id: a.id,
    wabaId: a.wabaId,
    status: a.status,
    hasToken: !!a.accessTokenEnc,
    phones: a.phoneNumbers.map((p) => ({
      id: p.id,
      phoneNumberId: p.phoneNumberId,
      displayNumber: p.displayNumber,
      verifiedName: p.verifiedName ?? null,
      qualityRating: p.qualityRating ?? null,
    })),
  }));

  const baseUrl = await getRequestBaseUrl();
  const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`;
  const { verifyToken } = await getMetaWebhookConfig();
  const embeddedConfigured =
    !!process.env.NEXT_PUBLIC_META_APP_ID && !!process.env.NEXT_PUBLIC_META_CONFIG_ID;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-start gap-4 rounded-card bg-brand p-5 text-white shadow-card-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10">
          <Globe className="h-6 w-6" />
        </span>
        <div>
          <div className="text-lg font-bold">Channels</div>
          <p className="text-sm text-white/80">
            Connect one or more WhatsApp numbers. Pick a number on the left to view its
            health or edit the connection on the right.
          </p>
        </div>
      </div>

      <ChannelsManager
        channels={channels}
        webhookUrl={webhookUrl}
        verifyToken={verifyToken ?? "(set a verify token in Admin → Settings → Integrations)"}
        embeddedConfigured={embeddedConfigured}
        manage={manage}
      />
    </div>
  );
}
