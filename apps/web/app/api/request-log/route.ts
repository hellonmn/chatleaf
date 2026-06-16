import { NextResponse } from "next/server";
import { pushLog, recentLogs } from "@/lib/request-log";
import { getPlatformAdmin } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: middleware records a request here (fire-and-forget, internal).
export async function POST(req: Request) {
  try {
    const b = await req.json();
    pushLog({
      method: String(b.method ?? "GET").slice(0, 8),
      path: String(b.path ?? "/").slice(0, 512),
      ts: Number(b.ts) || Date.now(),
      ua: b.ua ? String(b.ua).slice(0, 256) : undefined,
      ip: b.ip ? String(b.ip).slice(0, 64) : undefined,
    });
  } catch {
    /* ignore malformed */
  }
  return new Response(null, { status: 204 });
}

// GET: the admin inspector polls this for new entries. Platform admins only.
export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return NextResponse.json({ logs: recentLogs(since) });
}
