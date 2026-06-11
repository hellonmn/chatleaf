"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, Prisma } from "@watool/db";
import { canHandleConversations } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { parseCsv } from "@/lib/csv";

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

/** Save the free-text internal note shown in the inbox contact panel. */
export async function setContactNotesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "No permission." };
  const contactId = String(formData.get("contactId") ?? "");
  const notes = (formData.get("notes") as string)?.slice(0, 1000) || null;
  if (!(await ownedContact(ctx.orgId, contactId))) return { error: "Not found." };
  await prisma.contact.update({ where: { id: contactId }, data: { notes } });
  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { ok: "Saved" };
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

/** Apply an action to many selected contacts at once (tag / stage / delete). */
export async function bulkContactsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "You don't have permission." };

  const ids = String(formData.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const op = String(formData.get("op") ?? "");
  if (ids.length === 0) return { error: "No contacts selected." };

  const owned = await prisma.contact.findMany({
    where: { id: { in: ids }, orgId: ctx.orgId },
    select: { id: true },
  });
  const ownedIds = owned.map((c) => c.id);
  if (ownedIds.length === 0) return { error: "No matching contacts." };

  if (op === "addTag") {
    const name = String(formData.get("tag") ?? "").trim();
    if (!name) return { error: "Enter a tag name." };
    const tag = await prisma.tag.upsert({
      where: { orgId_name: { orgId: ctx.orgId, name } },
      create: { orgId: ctx.orgId, name },
      update: {},
    });
    await prisma.contactTag.createMany({
      data: ownedIds.map((cid) => ({ contactId: cid, tagId: tag.id })),
      skipDuplicates: true,
    });
  } else if (op === "setStage") {
    const stage = String(formData.get("stage") ?? "");
    if (!STAGES.includes(stage as (typeof STAGES)[number])) return { error: "Invalid stage." };
    await prisma.contact.updateMany({
      where: { id: { in: ownedIds }, orgId: ctx.orgId },
      data: { stage: stage as (typeof STAGES)[number] },
    });
  } else if (op === "delete") {
    await prisma.contact.deleteMany({ where: { id: { in: ownedIds }, orgId: ctx.orgId } });
  } else {
    return { error: "Unknown action." };
  }

  revalidatePath("/dashboard/contacts");
  return { ok: `Updated ${ownedIds.length} contact(s).` };
}

const MAX_IMPORT = 5000;

/** Bulk-import contacts from a CSV (upsert by waId). Maps common header names;
 *  requires a phone or waId column. Creates/links tags and sets stage/value. */
export async function importContactsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireActiveContext();
  if (!canHandleConversations(ctx.role)) return { error: "You don't have permission." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 4 * 1024 * 1024) return { error: "File too large (4 MB max)." };

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { error: "CSV needs a header row and at least one contact." };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const col = {
    name: idx("name", "full name", "contact"),
    phone: idx("phone", "phone number", "mobile", "number", "whatsapp"),
    waId: idx("waid", "wa_id", "wa id"),
    stage: idx("stage", "lifecycle"),
    source: idx("source"),
    value: idx("value", "est. value", "estimated value", "amount"),
    tags: idx("tags", "tag"),
    notes: idx("notes", "note"),
  };
  if (col.phone < 0 && col.waId < 0) {
    return { error: "CSV must have a 'phone' or 'waId' column." };
  }

  const stageSet = new Set(STAGES);
  const tagCache = new Map<string, string>();
  const tagId = async (name: string): Promise<string> => {
    const key = name.toLowerCase();
    const hit = tagCache.get(key);
    if (hit) return hit;
    const tag = await prisma.tag.upsert({
      where: { orgId_name: { orgId: ctx.orgId, name } },
      create: { orgId: ctx.orgId, name },
      update: {},
    });
    tagCache.set(key, tag.id);
    return tag.id;
  };

  let created = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1, 1 + MAX_IMPORT)) {
    const get = (i: number) => (i >= 0 && i < r.length ? r[i]!.trim() : "");
    const rawPhone = get(col.phone);
    const waId = (get(col.waId) || rawPhone).replace(/\D/g, "");
    if (!waId) { skipped++; continue; }

    const name = get(col.name) || null;
    const phone = rawPhone || `+${waId}`;
    const stageRaw = get(col.stage).toUpperCase() as (typeof STAGES)[number];
    const stage = stageSet.has(stageRaw) ? stageRaw : undefined;
    const source = get(col.source) || undefined;
    const valNum = Number(get(col.value).replace(/[^\d.-]/g, ""));
    const value = Number.isFinite(valNum) && get(col.value) ? Math.round(valNum) : undefined;
    const notes = get(col.notes) || undefined;
    const tags = get(col.tags).split(/[;,|]/).map((t) => t.trim()).filter(Boolean);

    try {
      const existing = await prisma.contact.findUnique({
        where: { orgId_waId: { orgId: ctx.orgId, waId } },
        select: { id: true },
      });
      const data = {
        ...(name ? { name } : {}),
        phone,
        ...(stage ? { stage } : {}),
        ...(source ? { source } : {}),
        ...(value != null ? { value } : {}),
        ...(notes ? { notes } : {}),
      };
      const contact = await prisma.contact.upsert({
        where: { orgId_waId: { orgId: ctx.orgId, waId } },
        create: { orgId: ctx.orgId, waId, ...data },
        update: data,
      });
      if (existing) updated++; else created++;

      for (const t of tags.slice(0, 10)) {
        const tid = await tagId(t);
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: tid } },
          create: { contactId: contact.id, tagId: tid },
          update: {},
        });
      }
    } catch {
      skipped++;
    }
  }

  revalidatePath("/dashboard/contacts");
  return {
    ok: `Imported ${created} new, updated ${updated}${skipped ? `, skipped ${skipped}` : ""}.`,
  };
}
