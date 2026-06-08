"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lightweight "realtime": re-fetches the Server Components on an interval so new
 * inbound messages appear without a manual reload. This is a deliberate Phase 2
 * stand-in for WebSockets (Socket.IO / Pusher), which slot in later without
 * changing the page structure.
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
