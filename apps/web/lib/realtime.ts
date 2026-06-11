import { publishInboxEvent, subscribeInboxEvent } from "@watool/queue";

/**
 * Live inbox pub/sub. Delegates to the shared queue-package bus, which is
 * Redis-backed when REDIS_URL is set (cross-process: the worker + every web
 * instance) and an in-process EventEmitter otherwise (dev / single instance).
 */
export function publishInbox(orgId: string, payload?: string): void {
  publishInboxEvent(orgId, payload);
}

export function subscribeInbox(orgId: string, cb: (payload: string) => void): () => void {
  return subscribeInboxEvent(orgId, cb);
}
