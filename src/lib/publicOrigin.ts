/**
 * The single public origin for anything rendered into HTML: canonicals, Open
 * Graph URLs, JSON-LD, robots and the sitemap.
 *
 * Defect G-20. Origins were spread across the tree - main hardcoded
 * https://hkscda.com in twenty-odd routes, PR #60 rewrote them all to
 * https://hkscda.vercel.app, and server modules carried three different APP_URL
 * fallbacks. Nothing could be switched without a sweep.
 *
 * The default is decision D-1 and it is genuinely unsettled: the Vercel project
 * serves only hkscda.vercel.app today, while hkscda.com is the association's
 * live legacy site. Publishing canonicals for a domain this app does not serve is
 * wrong; so is inviting the index onto a hostname the association may not keep.
 * The plan's default is hkscda.com, and this keeps the switch to one variable so
 * the owner's decision is a config change rather than another sweep.
 *
 * Server-side APP_URL fallbacks are deliberately not unified here; they belong to
 * BP-5 with the deployment environment.
 */
const DEFAULT_PUBLIC_SITE_ORIGIN = "https://hkscda.com";

function normalise(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_ORIGIN;
  }
}

export const PUBLIC_SITE_ORIGIN = normalise(
  import.meta.env?.VITE_PUBLIC_SITE_ORIGIN ?? DEFAULT_PUBLIC_SITE_ORIGIN,
);

/** Absolute URL for a root-relative path. */
export function publicUrl(path = "/"): string {
  if (!path.startsWith("/")) return `${PUBLIC_SITE_ORIGIN}/${path}`;
  return `${PUBLIC_SITE_ORIGIN}${path}`;
}

/** The share image for a page with no photo of its own. */
export const DEFAULT_SHARE_IMAGE = "/brand/hkscda-logo-primary.jpg";

/**
 * Absolute URL for an image that may be stored root-relative, bundled by Vite
 * (`/assets/…`), or missing. Social crawlers resolve nothing: an Open Graph
 * image must be absolute or the share card goes blank.
 */
export function absolutePublicUrl(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return publicUrl(DEFAULT_SHARE_IMAGE);
  try {
    return new URL(trimmed, PUBLIC_SITE_ORIGIN).toString();
  } catch {
    return publicUrl(DEFAULT_SHARE_IMAGE);
  }
}
