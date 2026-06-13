import type { Redis } from "ioredis";
import { createRedisConnection } from "./connection";

/**
 * Fixed-window rate limiter. Redis-backed when REDIS_URL is configured (shared
 * across web instances); otherwise an in-process Map (fine for dev / single
 * instance). Fails OPEN — if Redis errors, the request is allowed rather than
 * dropped.
 */
export type RateLimitResult = { allowed: boolean; remaining: number; resetSec: number };

function redisConfigured(): boolean {
  const url = process.env.REDIS_URL;
  return (
    !!url &&
    !url.includes("REPLACE_WITH") &&
    (url.startsWith("redis://") || url.startsWith("rediss://"))
  );
}

let client: Redis | null = null;
function getClient(): Redis | null {
  if (!redisConfigured()) return null;
  if (!client) client = createRedisConnection();
  return client;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redis = getClient();
  if (redis) {
    try {
      const k = `rl:${key}`;
      const count = await redis.incr(k);
      if (count === 1) await redis.expire(k, windowSec);
      let ttl = await redis.ttl(k);
      if (ttl < 0) ttl = windowSec;
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSec: ttl };
    } catch {
      /* fail open via the in-memory path below */
    }
  }

  const now = Date.now();
  // Opportunistic cleanup so the Map can't grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, resetSec: windowSec };
  }
  b.count++;
  return {
    allowed: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    resetSec: Math.ceil((b.resetAt - now) / 1000),
  };
}
