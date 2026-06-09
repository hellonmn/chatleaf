/**
 * Chatleaf logo — a wordmark where the "a" in "Chat" is a folded leaf, sitting
 * exactly where the word "leaf" begins. "Chat" is ink, "leaf" is ocean.
 * From the Chatleaf Brand Guide (§02 Logo). Server-component friendly.
 */

export function LeafGlyph({
  size = 28,
  bowl = "#7fcfe6",
  stem = "#0e7490",
  vein = "#ffffff",
  className,
}: {
  size?: number;
  bowl?: string;
  stem?: string;
  vein?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <path d="M23 5C11 5 3 12 3 20c0 7 7 12 17 11.5C19 24 19 13 23 5Z" fill={bowl} />
      <path
        d="M20 9C13 13 9 20 8 28"
        stroke={vein}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.75}
      />
      <rect x="22" y="3" width="5" height="28" rx="2" fill={stem} />
    </svg>
  );
}

export function Wordmark({
  size = 24,
  chat = "#1c1f2a",
  leaf = "#0e7490",
  bowl,
  stem,
  vein,
  className = "",
}: {
  size?: number;
  /** Colour of the "Ch…t" ink letters. */
  chat?: string;
  /** Colour of "leaf". */
  leaf?: string;
  bowl?: string;
  stem?: string;
  vein?: string;
  className?: string;
}) {
  const leafHeight = size * 0.62;
  const leafWidth = leafHeight * 0.78;
  return (
    <span
      className={`inline-flex items-end font-extrabold leading-none ${className}`}
      style={{ fontSize: size, letterSpacing: "-0.02em" }}
    >
      <span style={{ color: chat }}>Ch</span>
      <span className="inline-flex items-end" style={{ margin: "0 0.02em" }}>
        <svg
          width={leafWidth}
          height={leafHeight}
          viewBox="0 0 32 32"
          style={{ display: "block", overflow: "visible" }}
          aria-hidden
        >
          <path
            d="M23 5C11 5 3 12 3 20c0 7 7 12 17 11.5C19 24 19 13 23 5Z"
            fill={bowl ?? "#7fcfe6"}
          />
          <path
            d="M20 9C13 13 9 20 8 28"
            stroke={vein ?? "#ffffff"}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.75}
          />
          <rect x="22" y="3" width="5" height="28" rx="2" fill={stem ?? "#0e7490"} />
        </svg>
      </span>
      <span style={{ color: chat }}>t</span>
      <span style={{ color: leaf }}>leaf</span>
    </span>
  );
}
