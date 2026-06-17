"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to the live CRM SSE stream and re-fetches the board when a deal is
 * created, moved, or edited — by another agent or by a flow. Auto-reconnects.
 */
export function CrmRealtime() {
  const router = useRouter();
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/crm/stream");
      es.onmessage = (e) => {
        if (e.data === "ping" || e.data === "connected") return;
        router.refresh();
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
