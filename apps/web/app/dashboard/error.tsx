"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

/**
 * Dashboard error boundary. Catches errors thrown while rendering any dashboard
 * page (e.g. a transient DB/Neon cold-start timeout) and offers a retry instead
 * of a blank screen.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        Something went wrong
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        This is usually temporary — the database may have been waking up. Try
        again.
      </p>
      <button
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
