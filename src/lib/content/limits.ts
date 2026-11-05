/**
 * Content field limits shared by the server schemas (`schemas.ts`) and the admin inputs, so the
 * browser stops an admin at the same place the server would. No dependencies: the admin bundle
 * imports it.
 */

/** A story slug: lowercase letters and numbers in groups separated by single hyphens. */
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The same rule for an HTML `pattern` attribute, which is anchored by the browser. */
export const CONTENT_SLUG_INPUT_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

export const CONTENT_TITLE_MAX = 180;
export const CONTENT_SUMMARY_MAX = 320;
