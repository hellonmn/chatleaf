import { publishInboxEvent, subscribeInboxEvent, publishCrmEvent, subscribeCrmEvent } from "@watool/queue";

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

/** Live CRM pub/sub — fires when deals/stages change so open boards refresh. */
export function publishCrm(orgId: string, payload?: string): void {
  publishCrmEvent(orgId, payload);
}

export function subscribeCrm(orgId: string, cb: (payload: string) => void): () => void {
  return subscribeCrmEvent(orgId, cb);
}
