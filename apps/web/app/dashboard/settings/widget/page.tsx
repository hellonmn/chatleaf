import Link from "next/link";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { ChatWidgetTools } from "./ChatWidgetTools";

export const metadata = { title: "Chat link & widget — Chatleaf" };

export default async function WidgetPage() {
  const ctx = await requireActiveContext();

  const account = await prisma.whatsAppAccount.findFirst({
    where: { orgId: ctx.orgId },
    include: { phoneNumbers: true },
  });
  const numbers = (account?.phoneNumbers ?? [])
    .map((p) => ({ label: p.displayNumber, digits: p.displayNumber.replace(/\D/g, "") }))
    .filter((n) => n.digits.length >= 8);

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-1">
      <div>
        <h1 className="text-xl font-bold text-ink">Chat link &amp; widget</h1>
        <p className="mt-1 text-sm text-sub">
          A click-to-chat link, QR code, and a website button — all open a WhatsApp chat with your number.
        </p>
      </div>

      {numbers.length === 0 ? (
        <div className="rounded-card bg-warm/15 px-4 py-3 text-sm text-[#c47a2e]">
          Connect a WhatsApp number in{" "}
          <Link href="/dashboard/settings/whatsapp" className="font-semibold underline">Channels</Link>{" "}
          to generate your chat link.
        </div>
      ) : (
        <ChatWidgetTools numbers={numbers} org={ctx.orgName} />
      )}
    </div>
  );
}
