import { auth } from "@/auth";
import { prisma } from "@watool/db";
import { subscribeCrm } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for live CRM updates. The board opens this once;
 * whenever a deal is created/moved/edited (by an agent, another agent, or a
 * flow) we push `refresh` and the client re-fetches. Heartbeat keeps it alive.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!membership) return new Response("No workspace", { status: 403 });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch {
          /* closed */
        }
      };

      send("connected");
      const unsub = subscribeCrm(membership.orgId, (payload) => send(payload));
      const heartbeat = setInterval(() => send("ping"), 25_000);

      const close = () => {
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
