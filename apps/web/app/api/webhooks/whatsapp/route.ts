import { NextResponse } from "next/server";
import { prisma } from "@watool/db";
import { verifyWebhookSignature } from "@watool/wa";
import { getInboundQueue, isRedisConfigured } from "@watool/queue";
import { processInboundJob } from "@watool/processing";

// Webhooks need Node APIs (crypto, ioredis) and must never be statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

function appSecretConfigured(secret: string | undefined): secret is string {
  return !!secret && !secret.includes("REPLACE_WITH");
}

/**
 * GET — Meta webhook verification handshake. Echo back `hub.challenge` iff the
 * verify token matches.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  console.warn("[webhook] GET verify failed — token mismatch");
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST — inbound events (messages + statuses). Verify the signature on the raw
 * bytes, persist the raw event for audit/replay, then either enqueue (if Redis
 * is configured) or process inline (dev convenience). Always returns 200 so Meta
 * doesn't disable the webhook over a transient processing hiccup.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.headers.get("x-hub-signature-256");

  // Signature handling. In dev we allow a bypass so the pipeline is testable
  // before the exact app secret is wired; in production it is always enforced.
  const explicitSkip = process.env.META_SKIP_SIGNATURE_CHECK === "true";
  const secretReady = appSecretConfigured(appSecret);

  if (!secretReady && !isDev) {
    console.error("[webhook] META_APP_SECRET not configured; rejecting.");
    return new Response("Server not configured", { status: 500 });
  }

  const bypass = explicitSkip || (isDev && !secretReady);
  if (bypass) {
    console.warn(
      "[webhook] ⚠ signature check BYPASSED (dev). Set META_APP_SECRET to enforce it.",
    );
  } else if (!verifyWebhookSignature(rawBody, signature, appSecret!)) {
    console.warn(
      "[webhook] ✗ signature verification FAILED. Check META_APP_SECRET matches your Meta app's App Secret.",
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    const event = await prisma.webhookEvent.create({ data: { raw: parsed as object } });

    if (isRedisConfigured()) {
      await getInboundQueue().add("inbound", { webhookEventId: event.id, raw: parsed });
      console.log(`[webhook] enqueued event ${event.id}`);
    } else {
      // No queue configured — process inline so dev works without Upstash/worker.
      console.log(`[webhook] no Redis configured; processing inline (event ${event.id})`);
      await processInboundJob({ webhookEventId: event.id, raw: parsed });
    }
  } catch (err) {
    console.error("[webhook] processing/enqueue failed:", err);
  }

  return NextResponse.json({ received: true });
}
