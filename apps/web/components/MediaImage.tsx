"use client";

import { useState } from "react";

/**
 * Image with explicit loading + error states, so a slow or failed media-proxy
 * fetch (e.g. an expired token → 502) shows a clear message instead of an
 * endless browser spinner.
 */
export function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  if (status === "error") {
    return (
      <div className="rounded-lg bg-slate-100 px-3 py-4 text-xs text-slate-500">
        Couldn&apos;t load this image. The WhatsApp connection may need to be
        reconnected.
      </div>
    );
  }

  return (
    <div className="relative">
      {status === "loading" && (
        <div className="grid h-32 w-48 animate-pulse place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">
          loading…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
        className={`max-h-64 rounded-lg ${status === "loading" ? "hidden" : "block"}`}
      />
    </div>
  );
}
