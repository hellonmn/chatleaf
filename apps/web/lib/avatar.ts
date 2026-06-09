/** Deterministic avatar colour per contact (matches the multi-colour mockup). */
const PALETTE = [
  "#7c9cff", // blue
  "#f0a36b", // orange
  "#34c08a", // green
  "#a78bfa", // violet
  "#f08aae", // pink
  "#56a8d8", // sky
  "#0e7490", // ocean
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(seed: string): string {
  const parts = seed.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return seed.slice(0, 2).toUpperCase();
}
