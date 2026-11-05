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
