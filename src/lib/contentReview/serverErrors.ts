import type { AdminLanguage } from "../admin/language";

/**
 * The content review route's message that is not English. `http.server.ts` answers every failure of
 * the route (a forbidden request, a bad request, a database error) with it, for the list and for a
 * review alike, so the admin screen finds its code here and writes the message for the admin's
 * language. The route keeps sending the zh-HK text, and a test drives the real route to keep this
 * table in step with it.
 *
 * The other routes the review screens call (`review-bulk`) answer in English and are shown as sent.
 */
export type ContentReviewServerErrorCode = "reviewFailed";

const CONTENT_REVIEW_SERVER_ERROR_TEXT: Record<
  ContentReviewServerErrorCode,
  Record<AdminLanguage, string>
> = {
  reviewFailed: {
    zh: "未能完成內容審核，請檢查資料及版本後重試。",
    en: "Could not complete the review request. Reload the page, check the details and the version, then try again.",
  },
};

/** The message for a content review route error code. Defaults to zh-HK, the text the route sends. */
export function contentReviewServerErrorText(
  code: ContentReviewServerErrorCode,
  language: AdminLanguage = "zh",
): string {
  return CONTENT_REVIEW_SERVER_ERROR_TEXT[code][language];
}

const CODES = Object.keys(CONTENT_REVIEW_SERVER_ERROR_TEXT) as ContentReviewServerErrorCode[];

/**
 * The code for an `Error` whose message is exactly the zh-HK text the content review route sends,
 * or `null` for any other error, which the screen shows as it came.
 */
export function contentReviewServerErrorCode(error: unknown): ContentReviewServerErrorCode | null {
  if (!(error instanceof Error)) return null;
  return CODES.find((code) => CONTENT_REVIEW_SERVER_ERROR_TEXT[code].zh === error.message) ?? null;
}
