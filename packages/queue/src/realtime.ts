import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { createRedisConnection } from "./connection";

/**
 * Cross-process pub/sub for live inbox updates.
 *
 * - When REDIS_URL is configured, events fan out over a Redis channel so the
 *   queue worker and every web instance stay in sync (true horizontal scale).
 * - Otherwise it falls back to an in-process EventEmitter (dev / single
 *   instance with inline webhook processing).
 *
 * Subscribers always listen on a local emitter; when Redis is on, a single
 * shared subscriber connection re-emits incoming messages onto that emitter.
 */
const CHANNEL = "chatleaf:inbox";

function redisConfigured(): boolean {
  const url = process.env.REDIS_URL;
  return (
    !!url &&
    !url.includes("REPLACE_WITH") &&
    (url.startsWith("redis://") || url.startsWith("rediss://"))
  );
}

type Glob = { __clBus?: EventEmitter; __clPub?: Redis; __clSubInit?: boolean };
const g = globalThis as unknown as Glob;
const bus = g.__clBus ?? (g.__clBus = new EventEmitter());
bus.setMaxListeners(0);

const evName = (orgId: string) => `inbox:${orgId}`;

/** Lazily start the Redis subscriber (once per process) that re-broadcasts
 *  channel messages onto the local emitter. */
function ensureSubscriber(): void {
  if (!redisConfigured() || g.__clSubInit) return;
  g.__clSubInit = true;
  try {
    const sub = createRedisConnection();
    sub.subscribe(CHANNEL).catch((e) => console.error("[realtime] subscribe failed:", e));
    sub.on("message", (_channel, message) => {
      try {
        const { orgId, payload } = JSON.parse(message) as { orgId: string; payload?: string };
        bus.emit(evName(orgId), payload ?? "refresh");
      } catch {
        /* malformed */
      }
    });
  } catch (e) {
    console.error("[realtime] subscriber init failed:", e);
    g.__clSubInit = false; // allow a later retry
  }
}

function publisher(): Redis | null {
  if (!redisConfigured()) return null;
  if (!g.__clPub) {
    try {
      g.__clPub = createRedisConnection();
    } catch (e) {
      console.error("[realtime] publisher init failed:", e);
      return null;
    }
  }
  return g.__clPub ?? null;
}

/** Notify any open inboxes for an org. `payload` is "refresh" or a small JSON
 *  string (e.g. an inbound-message preview) the client can act on. */
export function publishInboxEvent(orgId: string, payload: string = "refresh"): void {
  const pub = publisher();
  if (pub) {
    // Same-process subscribers receive it back via the Redis subscriber.
    pub.publish(CHANNEL, JSON.stringify({ orgId, payload })).catch((e) => console.error("[realtime] publish failed:", e));
  } else {
    bus.emit(evName(orgId), payload); // single-process fallback
  }
}

/** Subscribe to an org's inbox events. Returns an unsubscribe function. */
export function subscribeInboxEvent(orgId: string, cb: (payload: string) => void): () => void {
  ensureSubscriber();
  const ev = evName(orgId);
  bus.on(ev, cb);
  return () => bus.off(ev, cb);
}
