import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { RepliesManager, type Reply } from "./RepliesManager";

export const metadata = { title: "Saved replies — Chatleaf" };

export default async function SavedRepliesPage() {
  const ctx = await requireActiveContext();
  const rows = await prisma.savedReply.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, shortcut: true, body: true },
  });
  const replies: Reply[] = rows;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-1">
      <div>
        <h1 className="text-xl font-bold text-ink">Saved replies</h1>
        <p className="mt-1 text-sm text-sub">
          Reusable canned responses your team can drop into any chat — type{" "}
          <code className="rounded bg-canvas px-1">/shortcut</code> in the inbox to insert one instantly.
        </p>
      </div>
      <RepliesManager replies={replies} />
    </div>
  );
}
