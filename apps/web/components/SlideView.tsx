"use client";

import { type Slide, isVideoFile } from "@/lib/spotlight-types";

function Media({ slide, className = "" }: { slide: Slide; className?: string }) {
  if (slide.mediaType === "none" || !slide.mediaUrl) return null;
  if (slide.mediaType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={slide.mediaUrl} alt={slide.title} className={`w-full rounded-card object-cover ${className}`} />;
  }
  // video
  if (isVideoFile(slide.mediaUrl)) {
    return <video src={slide.mediaUrl} controls className={`w-full rounded-card ${className}`} />;
  }
  return (
    <div className={`aspect-video w-full overflow-hidden rounded-card ${className}`}>
      <iframe src={slide.mediaUrl} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    </div>
  );
}

function TextBlock({ slide, center }: { slide: Slide; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      {slide.title && <h3 className="text-xl font-extrabold tracking-tight text-ink">{slide.title}</h3>}
      {slide.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-sub">{slide.body}</p>}
      {slide.ctaLabel && slide.ctaUrl && (
        <a
          href={slide.ctaUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
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
        <Media slide={slide} />
        <TextBlock slide={slide} />
      </div>
    );
  }
  if (slide.layout === "media-top") {
    return (
      <div className="space-y-4">
        <Media slide={slide} />
        <TextBlock slide={slide} center />
      </div>
    );
  }
  if (slide.layout === "media-small") {
    return (
      <div className="flex items-center gap-4">
        <div className="w-32 shrink-0">
          <Media slide={slide} />
        </div>
        <TextBlock slide={slide} />
      </div>
    );
  }
  return <TextBlock slide={slide} center />;
}
