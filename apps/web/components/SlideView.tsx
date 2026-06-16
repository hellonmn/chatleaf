"use client";

import { ImageIcon } from "lucide-react";
import { type Slide, isVideoFile } from "@/lib/spotlight-types";

function Media({ slide, ratio = "video" }: { slide: Slide; ratio?: "video" | "square" }) {
  const box = `w-full overflow-hidden rounded-card bg-canvas ${ratio === "video" ? "aspect-video" : "aspect-[4/3]"}`;
  if (slide.mediaType === "none") return null;

  if (!slide.mediaUrl) {
    // Placeholder so the layout reads correctly while editing.
    return (
      <div className={`grid place-items-center ${box} text-faint`}>
        <ImageIcon className="h-7 w-7" />
      </div>
    );
  }
  if (slide.mediaType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={slide.mediaUrl} alt={slide.title || "slide"} className={`object-cover ${box}`} />;
  }
  if (isVideoFile(slide.mediaUrl)) {
    return <video src={slide.mediaUrl} controls className={box} />;
  }
  return (
    <div className={box}>
      <iframe
        src={slide.mediaUrl}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function TextBlock({ slide, center }: { slide: Slide; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      <h3 className="text-xl font-extrabold leading-snug tracking-tight text-ink">
        {slide.title || <span className="text-faint">Slide title</span>}
      </h3>
      {slide.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-sub">{slide.body}</p>}
      {slide.ctaLabel && slide.ctaUrl && (
        <a
          href={slide.ctaUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-4 inline-flex rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark ${center ? "mx-auto" : ""}`}
        >
          {slide.ctaLabel}
        </a>
      )}
    </div>
  );
}

/** Renders one spotlight slide per its layout. Shared by the modal + admin preview. */
export function SlideView({ slide }: { slide: Slide }) {
  if (slide.layout === "media-left") {
    return (
      <div className="grid items-center gap-5 sm:grid-cols-2">
        <Media slide={slide} ratio="square" />
        <TextBlock slide={slide} />
      </div>
    );
  }
  if (slide.layout === "media-top") {
    return (
      <div className="space-y-4">
        <Media slide={slide} ratio="video" />
        <TextBlock slide={slide} center />
      </div>
    );
  }
  if (slide.layout === "media-small") {
    return (
      <div className="flex items-center gap-4">
        <div className="w-28 shrink-0 sm:w-36">
          <Media slide={slide} ratio="square" />
        </div>
        <TextBlock slide={slide} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md py-4">
      <TextBlock slide={slide} center />
    </div>
  );
}
