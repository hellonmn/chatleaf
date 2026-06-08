/** Turn a name into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Append a short random suffix to keep slugs unique without a DB round-trip loop. */
export function uniqueSlug(input: string, rand: string): string {
  const base = slugify(input) || "org";
  return `${base}-${rand.slice(0, 6)}`;
}
