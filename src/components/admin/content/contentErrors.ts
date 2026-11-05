import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import type { AdminLanguage } from "../../../lib/admin/language";
import { failureClass } from "../failureClass";
import { contentCommonCopy } from "./contentCommonCopy";

/** Why a content logic module refused to go on. The text of each code is in `contentCommonCopy`. */
export type ContentErrorCode = keyof typeof contentCommonCopy.zh.errors;

/**
 * The code a lifecycle failure carries: its category, or the reason of a known refusal (BUG-69,
 * `ContentLifecycleReason` on the server), so the line names the real cause.
 */
export type ContentLifecycleErrorCode =
  | "conflict"
  | "not_found"
  | "invalid"
  | "internal"
  | "media_cover_internal"
  | "session_expired"
  | "media_mismatch"
  | "link_exists"
  | "primary_subject_exists"
  | "slug_taken";

const CONTENT_LIFECYCLE_ERROR_CODES: readonly ContentLifecycleErrorCode[] = [
  "conflict",
  "not_found",
  "invalid",
  "internal",
  "media_cover_internal",
  "session_expired",
  "media_mismatch",
  "link_exists",
  "primary_subject_exists",
  "slug_taken",
];

/** Refusals of the input that are never a stale version, whatever status they came with. */
const NOT_A_CONFLICT: readonly string[] = ["link_exists", "primary_subject_exists"];

function contentLifecycleCode(error: unknown): ContentLifecycleErrorCode | null {
  if (!(error instanceof AdminApiError)) return null;
  const code = error.code;
  return CONTENT_LIFECYCLE_ERROR_CODES.find((known) => known === code) ?? "internal";
}

function errorCode(error: object): unknown {
  return "code" in error ? error.code : undefined;
}

/**
 * Whether a failed save is a conflict the editor shows its conflict banner for (and blocks
 * Publish on): a 409, except a refusal whose reason says the input clashes with a record that
 * already exists, such as a duplicate link (BUG-69).
 */
export function isContentConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error) || error.status !== 409)
    return false;
  const code = errorCode(error);
  return typeof code !== "string" || !NOT_A_CONFLICT.includes(code);
}

/** Whether a failure says the private upload session expired, so a retry needs a new one. */
export function isUploadSessionExpired(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && errorCode(error) === "session_expired");
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
