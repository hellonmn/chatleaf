"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadLogoAction, removeLogoAction, type LogoState } from "@/lib/actions/admin";

export function LogoUpload({ logoUrl, brandName }: { logoUrl: string | null; brandName: string }) {
  const [state, action, pending] = useActionState<LogoState, FormData>(uploadLogoAction, undefined);

  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-canvas">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-[10px] text-faint">No logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logo"
              accept="image/*"
              className="text-sm text-sub file:mr-2 file:rounded-btn file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-line"
            />
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              <Upload className="h-4 w-4" /> Upload
            </button>
          </form>
          {logoUrl && (
            <form action={removeLogoAction} className="mt-2">
              <button className="text-xs font-semibold text-rose hover:underline">Remove logo</button>
            </form>
          )}
          {state?.error && <p className="mt-2 text-xs text-rose">{state.error}</p>}
          {state?.ok && <p className="mt-2 text-xs text-emerald-700">{state.ok}</p>}
          <p className="mt-2 text-xs text-faint">PNG/SVG, under 256 KB. Replaces the wordmark in the sidebars.</p>
        </div>
      </div>
    </div>
  );
}
