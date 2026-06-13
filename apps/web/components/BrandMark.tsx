import { Wordmark } from "@/components/Wordmark";

/**
 * White-label brand mark. Shows a custom logo image or brand name when the
 * operator has set them in Platform settings; otherwise falls back to the
 * default Chatleaf wordmark. Server-component friendly.
 */
export function BrandMark({
  brandName,
  logoUrl,
  size = 24,
}: {
  brandName: string;
  logoUrl: string | null;
  size?: number;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={brandName} style={{ height: size, width: "auto" }} />;
  }
  if (brandName && brandName !== "Chatleaf") {
    return (
      <span
        className="font-extrabold tracking-tight text-ink"
        style={{ fontSize: size, letterSpacing: "-0.02em" }}
      >
        {brandName}
      </span>
    );
  }
  return <Wordmark size={size} />;
}
