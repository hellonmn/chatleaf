import { Queue, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "./connection";

export { createRedisConnection } from "./connection";
export { publishInboxEvent, subscribeInboxEvent } from "./realtime";
export { Worker, type Job, type ConnectionOptions } from "bullmq";

/** Name of the inbound-webhook processing queue. */
export const WA_INBOUND_QUEUE = "wa-inbound";

/**
 * True only when REDIS_URL points at a real Redis. Lets the webhook route fall
 * back to inline processing in dev when no queue is configured (the placeholder
 * value or an unset URL count as "not configured").
 */
export function isRedisConfigured(): boolean {
  const url = process.env.REDIS_URL;
  return (
    !!url &&
    !url.includes("REPLACE_WITH") &&
    (url.startsWith("redis://") || url.startsWith("rediss://"))
  );
}

/**
 * Job payload for inbound WhatsApp webhook processing. The webhook route stays
 * dumb: it persists the raw event (WebhookEvent) and enqueues just the id +
 * the parsed change, returning 200 immediately. The worker does the real work.
 */
export type WaInboundJob = {
  webhookEventId: string;
  /** The raw, unparsed webhook body (so the worker can re-validate). */
  raw: unknown;
};

// Build via a helper so the queue's TYPE is inferred from the constructor —
// hand-writing BullMQ v5's multi-param Queue generic is brittle.
function buildInboundQueue() {
  return new Queue<WaInboundJob>(WA_INBOUND_QUEUE, {
    // ioredis is physically duplicated in this monorepo (same version, two
    // paths), so TS sees two nominal `Redis` types. Runtime is fine; bridge here.
    connection: createRedisConnection() as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

let _inboundQueue: ReturnType<typeof buildInboundQueue> | undefined;

/** Lazily-created singleton producer queue (used by the web webhook route). */
export function getInboundQueue() {
  if (!_inboundQueue) _inboundQueue = buildInboundQueue();
  return _inboundQueue;
}
