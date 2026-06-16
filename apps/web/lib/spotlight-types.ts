import { z } from "zod";

export const SLIDE_LAYOUTS = ["text", "media-top", "media-left", "media-small"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const LAYOUT_LABELS: Record<SlideLayout, string> = {
  text: "Text only",
  "media-top": "Full media, title below",
  "media-left": "Media left, text right",
  "media-small": "Small media + text",
};

export const slideSchema = z.object({
  layout: z.enum(SLIDE_LAYOUTS),
  title: z.string().trim().max(120),
  body: z.string().trim().max(1500).optional().default(""),
  mediaType: z.enum(["none", "image", "video"]),
  mediaUrl: z.string().trim().max(1500).optional().default(""),
  ctaLabel: z.string().trim().max(40).optional().default(""),
  ctaUrl: z.string().trim().max(800).optional().default(""),
});
export type Slide = z.infer<typeof slideSchema>;

export const slidesSchema = z.array(slideSchema).max(20);

export function emptySlide(): Slide {
  return { layout: "media-left", title: "", body: "", mediaType: "video", mediaUrl: "", ctaLabel: "", ctaUrl: "" };
}

/** Is the media URL a file we can play in <video> (vs. an embeddable iframe)? */
export function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}
