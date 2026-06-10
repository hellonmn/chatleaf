import { redirect } from "next/navigation";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { TemplateForm } from "./TemplateForm";

export const metadata = { title: "New template — Chatleaf" };

export default async function NewTemplatePage() {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) redirect("/dashboard/templates");

  const account = await prisma.whatsAppAccount.findFirst({
    where: { orgId: ctx.orgId },
    select: { id: true },
  });

  return <TemplateForm hasAccount={!!account} />;
}
