"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { SLIDE_LAYOUTS, LAYOUT_LABELS, emptySlide, type Slide } from "@/lib/spotlight-types";
import { saveSpotlightAction, type SpotlightState } from "@/lib/actions/admin";
import { SlideView } from "@/components/SlideView";
import { SpotlightModal } from "@/components/SpotlightModal";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-sub">{label}</label>
      {children}
    </div>
  );
}

export function SpotlightEditor({
  initialSlides,
  initialActive,
}: {
  initialSlides: Slide[];
  initialActive: boolean;
}) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides.length ? initialSlides : [emptySlide()]);
  const [active, setActive] = useState(initialActive);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [state, formAction] = useActionState<SpotlightState, FormData>(saveSpotlightAction, undefined);

  const update = (i: number, patch: Partial<Slide>) =>
    setSlides((s) => s.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl)));
  const remove = (i: number) => setSlides((s) => s.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setSlides((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });

  const iconBtn = "grid h-7 w-7 place-items-center rounded-btn border border-line text-sub hover:bg-canvas disabled:opacity-40";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="slides" value={JSON.stringify(slides)} />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-line" />
          Active (show to users on login)
        </label>
        <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
          <Eye className="h-4 w-4" /> Preview deck
        </button>
      </div>

      {slides.map((sl, i) => (
        <div key={i} className="space-y-3 rounded-card border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-faint">Slide {i + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} className={iconBtn}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => remove(i)} className="grid h-7 w-7 place-items-center rounded-btn border border-line text-rose hover:bg-rose/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Layout">
              <select value={sl.layout} onChange={(e) => update(i, { layout: e.target.value as Slide["layout"] })} className={field}>
                {SLIDE_LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}
              </select>
            </Field>
            <Field label="Media type">
              <select value={sl.mediaType} onChange={(e) => update(i, { mediaType: e.target.value as Slide["mediaType"] })} className={field}>
                <option value="none">None</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </Field>
          </div>

          <Field label="Title">
            <input value={sl.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Introducing payment links" className={field} />
          </Field>
          <Field label="Text">
            <textarea value={sl.body} onChange={(e) => update(i, { body: e.target.value })} rows={3} className={field} />
          </Field>
          {sl.mediaType !== "none" && (
            <Field label={sl.mediaType === "image" ? "Image URL" : "Video URL (YouTube/Vimeo embed or .mp4)"}>
              <input value={sl.mediaUrl} onChange={(e) => update(i, { mediaUrl: e.target.value })} placeholder="https://…" className={field} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button label (optional)">
              <input value={sl.ctaLabel} onChange={(e) => update(i, { ctaLabel: e.target.value })} placeholder="Learn more" className={field} />
            </Field>
            <Field label="Button URL (optional)">
              <input value={sl.ctaUrl} onChange={(e) => update(i, { ctaUrl: e.target.value })} placeholder="https://…" className={field} />
            </Field>
          </div>

          <div className="rounded-card bg-[#e9eef3] p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-faint">
              Live preview — how users see it
            </div>
            <div className="rounded-card bg-white p-5 shadow-card">
              <SlideView slide={sl} />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setSlides((s) => [...s, emptySlide()])}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line px-3 py-3 text-sm font-semibold text-sub hover:bg-canvas"
      >
        <Plus className="h-4 w-4" /> Add slide
      </button>

      {state?.error && <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}

      <div className="flex gap-2">
        <button type="submit" name="publish" value="off" className="rounded-btn border border-line px-4 py-2 text-sm font-semibold text-sub hover:bg-canvas">
          Save draft
        </button>
        <button type="submit" name="publish" value="on" className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Publish to everyone
        </button>
      </div>

      {previewOpen && <SpotlightModal slides={slides} preview onClose={() => setPreviewOpen(false)} />}
    </form>
  );
}
