import type { AdminLanguage } from "../admin/language";
import { AdminApiError, adminErrorMessage } from "../admin/session";
import { volunteerCodeMessageFromText, volunteerErrorMessage } from "./apiResult";
import { BulkInputError, bulkInputErrorText } from "./bulk/service";
import {
  VolunteerSelectionError,
  volunteerSelectionErrorText,
} from "./directory/reviewerBulkSelection";
import { volunteerServerErrorCode, volunteerServerErrorText } from "./serverErrors";

const CHINESE = /[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u;

/**
 * The message for an error caught on a volunteer admin screen, in `language`. It starts from
 * `adminErrorMessage`, the general error-text function, so a session error is translated and an
 * English message of an error that did not come from the API is shown as it came.
 *
 * Two errors the volunteer code throws itself (`BulkInputError`, `VolunteerSelectionError`) are
 * written from their code. A volunteer API error reaches the browser with a zh-HK message
 * (`fetchAdminJson` writes it into the `AdminApiError`). Chinese keeps showing it. English finds the
 * English text of that exact message in `apiResult` or `serverErrors`, and when the message is not in
 * either, it shows the message that fits the HTTP status instead, never the Chinese text. A server
 * message that is English already (`Invalid volunteer id`) is replaced by `fetchAdminJson` with the
 * zh-HK message for its status, so it too reaches English as the message for that status.
 */
export function volunteerAdminErrorMessage(
  error: unknown,
  language: AdminLanguage = "zh",
): string | null {
  if (error instanceof BulkInputError) return bulkInputErrorText(error.code, language);
  if (error instanceof VolunteerSelectionError) {
    return volunteerSelectionErrorText(error.code, language);
  }
  const message = adminErrorMessage(error, language);
  if (message === null || language === "zh" || !CHINESE.test(message)) return message;
  const code = volunteerServerErrorCode(message);
  const known = code
    ? volunteerServerErrorText(code, language)
    : volunteerCodeMessageFromText(message);
  if (known) return known;
  return volunteerErrorMessage({}, error instanceof AdminApiError ? error.status : 500, language);
}
