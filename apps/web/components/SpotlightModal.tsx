"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { type Slide } from "@/lib/spotlight-types";
import { SlideView } from "@/components/SlideView";
import { dismissSpotlightAction } from "@/lib/actions/spotlight";

/**
 * "What's new" spotlight shown on dashboard login. Next/Back through slides,
 * Finish on the last. In `preview` mode (admin) it skips the server dismiss.
 */
export function SpotlightModal({
  slides,
  preview = false,
  onClose,
}: {
  slides: Slide[];
  preview?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  if (!open || slides.length === 0) return null;

  const last = i === slides.length - 1;
  function close() {
    setOpen(false);
    if (!preview) void dismissSpotlightAction();
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-card bg-white p-6 shadow-card-lg">
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-canvas hover:text-sub"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="min-h-[220px] pt-2">
          <SlideView slide={slides[i]!} />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {slides.map((_, d) => (
              <span key={d} className={`h-1.5 w-6 rounded-full ${d === i ? "bg-brand" : "bg-line"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="rounded-btn border border-line px-4 py-2 text-sm font-semibold text-sub hover:bg-canvas"
              >
                Back
              </button>
            )}
            {last ? (
              <button
                onClick={close}
                className="rounded-btn bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                {preview ? "Close" : "Finish"}
              </button>
            ) : (
              <button
                onClick={() => setI(i + 1)}
                className="rounded-btn bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
