import type { AdminLanguage } from "../admin/language";

/**
 * The sponsorship API's messages that are not English. Every other message the sponsorship
 * routes send is already English (see `http.server.ts`), so the admin shows it as sent; this one
 * is zh-HK, so the admin screen finds its code here and writes the message for the admin's
 * language. The server (`repository.server.ts`) keeps sending the zh-HK text, and a test drives
 * the real server path to keep this table in step with it.
 */
export type SponsorshipServerErrorCode = "proofReviewChanged";

const SPONSORSHIP_SERVER_ERROR_TEXT: Record<
  SponsorshipServerErrorCode,
  Record<AdminLanguage, string>
> = {
  // A proof review is refused when the proof or its revision changed after the page loaded.
  proofReviewChanged: {
    zh: "付款證明或審批資料已更新，請重新載入。",
    en: "The payment proof or review changed. Reload the pledge and review it again.",
  },
};

/** The message for a sponsorship server error code. Defaults to zh-HK, the text the API sends. */
export function sponsorshipServerErrorText(
  code: SponsorshipServerErrorCode,
  language: AdminLanguage = "zh",
): string {
  return SPONSORSHIP_SERVER_ERROR_TEXT[code][language];
}

const CODES = Object.keys(SPONSORSHIP_SERVER_ERROR_TEXT) as SponsorshipServerErrorCode[];

/**
 * The code for an `Error` whose message is exactly one of the zh-HK texts the sponsorship API
 * sends, or `null` for any other error, which the screen shows as it came.
 */
export function sponsorshipServerErrorCode(error: unknown): SponsorshipServerErrorCode | null {
  if (!(error instanceof Error)) return null;
  return CODES.find((code) => SPONSORSHIP_SERVER_ERROR_TEXT[code].zh === error.message) ?? null;
}
