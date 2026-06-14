"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas print:hidden"
    >
      <Printer className="h-4 w-4" /> Print / Save PDF
    </button>
  );
}
