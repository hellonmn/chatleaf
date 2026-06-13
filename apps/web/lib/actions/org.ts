"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@watool/db";
import { notify } from "@watool/observability";
import { auth } from "@/auth";
import { uniqueSlug } from "@/lib/slug";

export type ActionState = { error?: string } | undefined;

const schema = z.object({ orgName: z.string().min(1).max(100) });

/** Create a new org for the signed-in user and make them OWNER. */
export async function createOrgAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = schema.safeParse({ orgName: formData.get("orgName") });
  if (!parsed.success) return { error: "Enter a workspace name." };

  const slug = uniqueSlug(parsed.data.orgName, randomBytes(8).toString("hex"));
  await prisma.$transaction(async (tx) => {
    const org = await tx.org.create({
      data: { name: parsed.data.orgName, slug },
    });
    await tx.membership.create({
      data: { orgId: org.id, userId: session.user!.id, role: "OWNER" },
    });
  });

  await notify({
    title: "New workspace signed up",
    message: `${parsed.data.orgName} just created a workspace.`,
    level: "info",
    fields: { org: parsed.data.orgName, owner: session.user.email ?? "—" },
  });

  redirect("/dashboard");
}
