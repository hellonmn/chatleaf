"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ActionState = { error?: string; ok?: string } | undefined;

const STAGES = ["NEW", "QUALIFIED", "ENGAGED", "CONVERTED"] as const;

/** Move a contact along the lifecycle pipeline. */
export async function setStageAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const parsed = z
    .object({ contactId: z.string().min(1), stage: z.enum(STAGES) })
    .safeParse({ contactId: formData.get("contactId"), stage: formData.get("stage") });
  if (!parsed.success) return;
  await prisma.contact.updateMany({
    where: { id: parsed.data.contactId, orgId: ctx.orgId },
    data: { stage: parsed.data.stage },
  });
  revalidatePath(`/dashboard/contacts/${parsed.data.contactId}`);
  revalidatePath("/dashboard/contacts");
}

const fieldsSchema = z.object({
  contactId: z.string().min(1),
  source: z.string().trim().max(60).optional(),
  value: z.string().trim().optional(),
});

/** Edit a contact's source + estimated value. */
export async function setContactFieldsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const parsed = fieldsSchema.safeParse({
    contactId: formData.get("contactId"),
    source: formData.get("source") || undefined,
    value: formData.get("value") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input." };
  const value = parsed.data.value ? parseInt(parsed.data.value.replace(/[^\d]/g, ""), 10) : null;
  if (parsed.data.value && Number.isNaN(value)) return { error: "Value must be a number." };
  if (!(await ownedContact(ctx.orgId, parsed.data.contactId))) return { error: "Not found." };
  await prisma.contact.update({
    where: { id: parsed.data.contactId },
    data: { source: parsed.data.source ?? null, value },
  });
  revalidatePath(`/dashboard/contacts/${parsed.data.contactId}`);
  return { ok: "Saved." };
}

const newContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  waId: z.string().trim().min(5, "Enter a valid number").max(20),
  source: z.string().trim().max(60).optional(),
  stage: z.enum(STAGES).default("NEW"),
});

/** Manually add a contact (lead). */
export async function addContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const parsed = newContactSchema.safeParse({
    name: formData.get("name"),
    waId: formData.get("waId"),
    source: formData.get("source") || undefined,
    stage: formData.get("stage") || "NEW",
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const waId = parsed.data.waId.replace(/[^\d]/g, ""); // digits only
  if (waId.length < 8) return { error: "Enter a valid phone number with country code." };

  const existing = await prisma.contact.findFirst({ where: { orgId: ctx.orgId, waId } });
  if (existing) return { error: "A contact with that number already exists." };

  const contact = await prisma.contact.create({
    data: {
      orgId: ctx.orgId,
      waId,
      name: parsed.data.name,
      phone: "+" + waId,
      source: parsed.data.source,
      stage: parsed.data.stage,
    },
  });
  redirect(`/dashboard/contacts/${contact.id}`);
}

/** Confirm the contact exists in the active org; returns it or null. */
async function ownedContact(orgId: string, contactId: string) {
  return prisma.contact.findFirst({ where: { id: contactId, orgId } });
}

const addTagSchema = z.object({
  contactId: z.string().min(1),
  name: z.string().trim().min(1, "Tag name required").max(40),
});

export async function addTagAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };

  const parsed = addTagSchema.safeParse({
    contactId: formData.get("contactId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  if (!(await ownedContact(ctx.orgId, parsed.data.contactId)))
    return { error: "Contact not found." };

  const tag = await prisma.tag.upsert({
    where: { orgId_name: { orgId: ctx.orgId, name: parsed.data.name } },
    create: { orgId: ctx.orgId, name: parsed.data.name },
    update: {},
  });
  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId: parsed.data.contactId, tagId: tag.id } },
    create: { contactId: parsed.data.contactId, tagId: tag.id },
    update: {},
  });

  revalidatePath(`/dashboard/contacts/${parsed.data.contactId}`);
  return { ok: "Tag added." };
}

export async function removeTagAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const contactId = String(formData.get("contactId") ?? "");
  const tagId = String(formData.get("tagId") ?? "");
  if (!contactId || !tagId) return;
  if (!(await ownedContact(ctx.orgId, contactId))) return;

  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
  revalidatePath(`/dashboard/contacts/${contactId}`);
}

const attrSchema = z.object({
  contactId: z.string().min(1),
  key: z.string().trim().min(1, "Key required").max(60),
  value: z.string().trim().max(500),
});

export async function setAttributeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };

  const parsed = attrSchema.safeParse({
    contactId: formData.get("contactId"),
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const contact = await ownedContact(ctx.orgId, parsed.data.contactId);
  if (!contact) return { error: "Contact not found." };

  const attrs = {
    ...((contact.attributes as Record<string, unknown>) ?? {}),
    [parsed.data.key]: parsed.data.value,
  };
  await prisma.contact.update({
    where: { id: contact.id },
    data: { attributes: attrs as Prisma.InputJsonValue },
  });

  revalidatePath(`/dashboard/contacts/${contact.id}`);
  return { ok: "Attribute saved." };
}

export async function removeAttributeAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const contactId = String(formData.get("contactId") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!contactId || !key) return;

  const contact = await ownedContact(ctx.orgId, contactId);
  if (!contact) return;

  const attrs = { ...((contact.attributes as Record<string, unknown>) ?? {}) };
  delete attrs[key];
  await prisma.contact.update({
    where: { id: contact.id },
    data: { attributes: attrs as Prisma.InputJsonValue },
  });
  revalidatePath(`/dashboard/contacts/${contactId}`);
}

const optInSchema = z.object({
  contactId: z.string().min(1),
  status: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]),
});

export async function setOptInAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return;
  const parsed = optInSchema.safeParse({
    contactId: formData.get("contactId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  await prisma.contact.updateMany({
    where: { id: parsed.data.contactId, orgId: ctx.orgId },
    data: { optInStatus: parsed.data.status },
  });
  revalidatePath(`/dashboard/contacts/${parsed.data.contactId}`);
}
