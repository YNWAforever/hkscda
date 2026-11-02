import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import type { AdminLanguage } from "../../../lib/admin/language";
import { failureClass } from "../failureClass";
import { contentCommonCopy } from "./contentCommonCopy";

/** Why a content logic module refused to go on. The text of each code is in `contentCommonCopy`. */
export type ContentErrorCode = keyof typeof contentCommonCopy.zh.errors;

export type ContentLifecycleErrorCode = "conflict" | "not_found" | "invalid" | "internal";

const CONTENT_LIFECYCLE_ERROR_CODES: readonly ContentLifecycleErrorCode[] = [
  "conflict",
  "not_found",
  "invalid",
  "internal",
];

function contentLifecycleCode(error: unknown): ContentLifecycleErrorCode | null {
  if (!(error instanceof AdminApiError)) return null;
  const code = error.code;
  return CONTENT_LIFECYCLE_ERROR_CODES.find((known) => known === code) ?? "internal";
}

/**
 * The banner line for a lifecycle failure. A structured `AdminApiError` carries the server's
 * lifecycle code, so the editor writes it in the admin's language instead of showing the
 * server's English default. A request that never reached the server reads as a network failure;
 * a session error is left to `adminErrorMessage`.
 */
export function contentLifecycleErrorMessage(
  error: unknown,
  language: AdminLanguage = "zh",
): string | null {
  const code = contentLifecycleCode(error);
  if (code) return contentCommonCopy[language].lifecycleErrors[code];
  if (error instanceof AdminSessionError) return null;
  if (failureClass(error) === "network") return contentCommonCopy[language].lifecycleErrors.network;
  return null;
}

/**
 * Thrown by the content logic modules (the media upload, the editor's operation gate and the
 * editor's own checks). Its `message` is the zh-HK text it always was, so code that shows it as it
 * is keeps working; a screen reads `code` and writes the message for the admin's language.
 */
export class ContentAdminError extends Error {
  constructor(readonly code: ContentErrorCode) {
    super(contentCommonCopy.zh.errors[code]);
    this.name = "ContentAdminError";
  }
}

/**
 * An error as a screen keeps it: the `code` of a content error, or the caught error itself when the
 * server may have given a reason. The text is written when the screen renders, in the admin's
 * language: `copy.errors[code]` for a code, `adminErrorMessage(cause, language)` otherwise.
 */
export type ContentFailure = { code?: ContentErrorCode; cause?: unknown };

export function contentFailure(cause: unknown): ContentFailure {
  return cause instanceof ContentAdminError ? { code: cause.code } : { cause };
}
