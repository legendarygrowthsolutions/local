/** URL slug from free text: lower-case ASCII letters, digits and single dashes. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** A host's public handle (`/h/<slug>`): 3–40 chars of letters, digits and dashes, no leading/trailing dash. */
export const HOST_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const HOST_SLUG_HINT = "3–40 lower-case letters, numbers or dashes";

/** Default handle for a brand name, padded so it always passes HOST_SLUG_RE. */
export function hostSlugFrom(brandName: string) {
  let s = slugify(brandName).slice(0, 40).replace(/-$/, "");
  if (s.length < 3) s = (s + "-host").replace(/^-/, "");
  return s;
}

/** Add a numeric suffix until `taken` says the slug is free. */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean> | boolean) {
  let candidate = base;
  for (let i = 2; await taken(candidate); i++) candidate = `${base.slice(0, 40 - String(i).length - 1)}-${i}`;
  return candidate;
}
