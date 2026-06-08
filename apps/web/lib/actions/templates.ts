"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma, type TemplateStatus } from "@watool/db";
import { fetchMessageTemplates, decryptSecret } from "@watool/wa";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ActionState = { error?: string; ok?: string } | undefined;

/** Map Meta's template status string to our enum. */
function mapStatus(metaStatus: string): TemplateStatus {
  switch (metaStatus.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    default:
      return "DRAFT"; // PAUSED / DISABLED / unknown
  }
}

/**
 * Pull all message templates from Meta for the org's WABA and mirror them into
 * our Template table. Re-runnable (upsert by name+language).
 */
export async function syncTemplatesAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can sync templates." };
  }

  const account = await prisma.whatsAppAccount.findFirst({
    where: { orgId: ctx.orgId },
  });
  if (!account?.accessTokenEnc) {
    return { error: "Connect WhatsApp first (Settings → WhatsApp)." };
  }

  let templates;
  try {
    templates = await fetchMessageTemplates({
      wabaId: account.wabaId,
      accessToken: decryptSecret(account.accessTokenEnc),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reach Meta." };
  }

  for (const t of templates) {
    await prisma.template.upsert({
      where: {
        orgId_name_language: {
          orgId: ctx.orgId,
          name: t.name,
          language: t.language,
        },
      },
      create: {
        orgId: ctx.orgId,
        name: t.name,
        language: t.language,
        category: t.category,
        components: t.components as Prisma.InputJsonValue,
        metaStatus: mapStatus(t.status),
        metaTemplateId: t.id,
      },
      update: {
        category: t.category,
        components: t.components as Prisma.InputJsonValue,
        metaStatus: mapStatus(t.status),
        metaTemplateId: t.id,
      },
    });
  }

  revalidatePath("/dashboard/templates");
  return { ok: `Synced ${templates.length} template(s) from Meta.` };
}
