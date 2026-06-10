"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, Prisma, type TemplateStatus } from "@watool/db";
import {
  fetchMessageTemplates,
  createMessageTemplate,
  buildTemplateComponents,
  decryptSecret,
  type TemplateButton,
} from "@watool/wa";
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

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().trim().min(1).max(25), url: z.string().url() }),
]);

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(512)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only."),
  category: z.enum(["MARKETING", "UTILITY"]),
  language: z.string().trim().min(2).max(10),
  header: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1, "Body text is required").max(1024),
  footer: z.string().trim().max(60).optional(),
});

/** Build sample values for the body's {{1}}…{{n}} placeholders (Meta needs them). */
function bodyExamples(body: string): string[] {
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const max = nums.length ? Math.max(...nums) : 0;
  const samples = ["Naman", "Chatleaf", "₹499", "Friday", "ORD-1024"];
  return Array.from({ length: max }, (_, i) => samples[i % samples.length]!);
}

/** Create a template in the app and submit it to Meta for review. */
export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) {
    return { error: "Only owners and admins can create templates." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    language: formData.get("language"),
    header: (formData.get("header") as string) || undefined,
    body: formData.get("body"),
    footer: (formData.get("footer") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let buttons: TemplateButton[] = [];
  const raw = formData.get("buttons");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const arr = z.array(buttonSchema).max(3).parse(JSON.parse(raw));
      buttons = arr;
    } catch {
      return { error: "One of the buttons is invalid (check the URL)." };
    }
  }

  const account = await prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } });
  if (!account?.accessTokenEnc) {
    return { error: "Connect WhatsApp first (Settings → WhatsApp)." };
  }

  const input = {
    name: parsed.data.name,
    language: parsed.data.language,
    category: parsed.data.category,
    body: parsed.data.body,
    header: parsed.data.header,
    footer: parsed.data.footer,
    buttons,
    bodyExample: bodyExamples(parsed.data.body),
  } as const;

  let result: { id: string; status: string };
  try {
    result = await createMessageTemplate({
      wabaId: account.wabaId,
      accessToken: decryptSecret(account.accessTokenEnc),
      ...input,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reach Meta." };
  }

  await prisma.template.upsert({
    where: {
      orgId_name_language: { orgId: ctx.orgId, name: input.name, language: input.language },
    },
    create: {
      orgId: ctx.orgId,
      name: input.name,
      language: input.language,
      category: input.category,
      components: buildTemplateComponents(input) as Prisma.InputJsonValue,
      metaStatus: mapStatus(result.status),
      metaTemplateId: result.id,
    },
    update: {
      category: input.category,
      components: buildTemplateComponents(input) as Prisma.InputJsonValue,
      metaStatus: mapStatus(result.status),
      metaTemplateId: result.id,
    },
  });

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}
