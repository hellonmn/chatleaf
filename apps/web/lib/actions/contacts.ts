"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";

export type ActionState = { error?: string; ok?: string } | undefined;

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
