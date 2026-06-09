"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to the live inbox SSE stream and re-fetches when something changes.
 * Auto-reconnects if the connection drops. This replaces aggressive polling —
 * messages now arrive the instant they're processed.
 */
export function InboxRealtime() {
  const router = useRouter();
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/inbox/stream");
      es.onmessage = (e) => {
        if (e.data === "refresh") router.refresh();
      };
      es.onerror = () => {
        es?.close();
        if (!stopped) retry = setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [router]);

  return null;
}
