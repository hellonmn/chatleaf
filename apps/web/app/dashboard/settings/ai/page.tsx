import { redirect } from "next/navigation";
import { prisma } from "@watool/db";
import { isAiConfigured } from "@watool/processing";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { AiKeyForm } from "./AiKeyForm";

export const metadata = { title: "AI assistant — Chatleaf" };

export default async function AiSettingsPage() {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) redirect("/dashboard");

  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: ctx.orgId },
    select: { aiApiKeyEnc: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-1">
      <div>
        <h1 className="text-xl font-bold text-ink">AI assistant</h1>
        <p className="mt-1 text-sm text-sub">
          Connect Claude to draft replies for your agents and power AI flow steps.
        </p>
      </div>
      <AiKeyForm hasKey={!!settings?.aiApiKeyEnc} envFallback={isAiConfigured()} />
    </div>
  );
}
