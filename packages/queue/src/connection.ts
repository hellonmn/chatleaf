import { Redis, type RedisOptions } from "ioredis";

/**
 * Shared ioredis connection factory for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection (it manages
 * retries itself and uses blocking commands). Upstash works with BullMQ over its
 * TLS endpoint — use the `rediss://...` "Redis" URL (NOT the REST URL).
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Use the Upstash 'Redis' (rediss://...) connection " +
        "string, not the REST URL.",
    );
  }

  const options: RedisOptions = {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  };

  // Upstash uses TLS (rediss://); ioredis enables TLS from the scheme, but we
  // set it explicitly so a plain `redis://` Upstash host still negotiates TLS.
  if (url.startsWith("rediss://")) {
    options.tls = { rejectUnauthorized: true };
  }

  return new Redis(url, options);
}
