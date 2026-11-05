/**
 * Content field limits shared by the server schemas (`schemas.ts`) and the admin inputs, so the
 * browser stops an admin at the same place the server would. No dependencies: the admin bundle
 * imports it.
 */

/** A story slug: lowercase letters and numbers in groups separated by single hyphens. */
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The same rule for an HTML `pattern` attribute, which is anchored by the browser. */
export const CONTENT_SLUG_INPUT_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

/**
 * The longest story slug, at every layer that checks one: the admin schema, the slug suggested
 * from a title, and the public story page's validators (BUG-70). It is the limit the admin always
 * allowed, so every slug already saved keeps loading publicly.
 */
export const CONTENT_SLUG_MAX = 180;

export const CONTENT_TITLE_MAX = 180;
export const CONTENT_SUMMARY_MAX = 320;

/**
 * The longest value of each optional text field, in characters after trimming (BUG-73). Every
 * save copies the row into two revision snapshots, and the SEO and OG fields go straight into the
 * public page's `<title>` and `og:*` tags, so none is unbounded. The database has no length
 * constraint on these columns and the public page does not truncate them; the values leave room
 * for search and share text (a search result shows about 60 characters of a title and 160 of a
 * description) and match the title (180) and summary (320) limits where the field stands in for
 * them. The body is far above any story the site carries.
 */
export const CONTENT_TEXT_MAX = {
  subtitle: 180,
  body: 50_000,
  ctaLabel: 60,
  seoTitle: 120,
  seoDescription: 320,
  ogTitle: 180,
  ogDescription: 320,
} as const;
