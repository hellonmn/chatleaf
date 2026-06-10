import { sendDueBroadcasts } from "@/lib/broadcast-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dispatch due scheduled broadcasts. Hit this on a schedule (e.g. every minute)
 * from Vercel Cron, Render Cron, or cron-job.org. Protected by CRON_SECRET —
 * pass it as `Authorization: Bearer <secret>` or `?key=<secret>`.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled until configured
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const key = new URL(req.url).searchParams.get("key");
  return bearer === secret || key === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const result = await sendDueBroadcasts();
  return Response.json({ ok: true, ...result });
}

// Vercel Cron sends GET; allow POST too for other schedulers.
export const POST = GET;
