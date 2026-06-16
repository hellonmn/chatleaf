/**
 * In-memory ring buffer of recent HTTP requests, for the admin request inspector.
 * Lives in the Node runtime (written by /api/_reqlog, read by the admin page).
 * Kept on globalThis so it survives dev HMR. Best-effort + single-instance —
 * great for dev/staging visibility; not a durable audit log.
 */
export type RequestLogEntry = {
  id: number;
  method: string;
  path: string;
  ts: number;
  ua?: string;
  ip?: string;
};

const g = globalThis as unknown as {
  __reqlog?: { items: RequestLogEntry[]; seq: number };
};
if (!g.__reqlog) g.__reqlog = { items: [], seq: 0 };
const store = g.__reqlog;

const MAX = 500;

export function pushLog(e: Omit<RequestLogEntry, "id">): void {
  store.seq += 1;
  store.items.push({ id: store.seq, ...e });
  if (store.items.length > MAX) store.items.splice(0, store.items.length - MAX);
}

/** Entries newer than `sinceId` (oldest→newest). */
export function recentLogs(sinceId = 0): RequestLogEntry[] {
  return store.items.filter((i) => i.id > sinceId);
}
