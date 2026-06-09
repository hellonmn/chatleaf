import { EventEmitter } from "node:events";

/**
 * Tiny in-process pub/sub for live inbox updates. The webhook (inline inbound
 * processing) and the agent-reply actions publish per-org; the SSE endpoint
 * subscribes and pushes a "refresh" to connected browsers.
 *
 * Scope: works within a single Node process (dev, and a single web instance on
 * Render). For multi-instance horizontal scaling, swap this for Redis pub/sub —
 * the publish/subscribe API stays the same.
 */
const g = globalThis as unknown as { __chatleafBus?: EventEmitter };
const bus: EventEmitter = g.__chatleafBus ?? (g.__chatleafBus = new EventEmitter());
bus.setMaxListeners(0);

const channel = (orgId: string) => `inbox:${orgId}`;

export function publishInbox(orgId: string): void {
  bus.emit(channel(orgId));
}

export function subscribeInbox(orgId: string, cb: () => void): () => void {
  const ev = channel(orgId);
  bus.on(ev, cb);
  return () => bus.off(ev, cb);
}
