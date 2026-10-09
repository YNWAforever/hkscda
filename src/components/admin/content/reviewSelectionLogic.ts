import { adminErrorMessage } from "../../../lib/admin/session";
import type { AdminLanguage } from "../../../lib/admin/language";
import { AnimalReviewSelectionError } from "../../../lib/contentReview/animalBulkSelection";
import { CmsReviewSelectionError } from "../../../lib/contentReview/cmsBulkSelection";
import {
  contentReviewServerErrorCode,
  contentReviewServerErrorText,
} from "../../../lib/contentReview/serverErrors";
import type { reviewCopy } from "./reviewCopy";

export type ReviewKind = "animal" | "content";

/** The ways the queue can fail to make a selection that are not a refusal from the selection code. */
export type QueueSelectionFailure = "select_failed" | "filter_changed" | "collect_failed";

/**
 * Why the review queue could not make a selection, as the queue keeps it: the code of a refusal
 * (with the kind of record it was for), or a failure code with the caught error, whose reason is
 * shown as the server gave it. The text is written when the queue renders.
 */
export type SelectionError =
  | { kind: ReviewKind; code: "out_of_range" | "list_changed" | "too_many" }
  | { code: QueueSelectionFailure; cause?: unknown };

/** The error to keep for something the selection code threw, or `fallback` for anything else. */
export function selectionErrorFrom(
  cause: unknown,
  kind: ReviewKind,
  fallback: QueueSelectionFailure,
): SelectionError {
  if (kind === "animal" && cause instanceof AnimalReviewSelectionError) {
    return { kind, code: cause.code };
  }
  if (kind === "content" && cause instanceof CmsReviewSelectionError) {
    return { kind, code: cause.code };
  }
  return { code: fallback, cause };
}

type QueueCopy = (typeof reviewCopy)["zh"]["queue"];

/**
 * The message for a selection error in `language`, from the queue's copy. A caught error whose message
 * is the zh-HK text the content review route sends is written from its code; any other reason is
 * shown as it came.
 */
export function selectionErrorText(
  error: SelectionError,
  copy: QueueCopy,
  language: AdminLanguage,
): string {
  if ("kind" in error) return copy.selectionErrors[error.kind][error.code];
  const routeError = contentReviewServerErrorCode(error.cause);
  if (routeError) return contentReviewServerErrorText(routeError, language);
  return adminErrorMessage(error.cause, language) ?? copy.selectionErrors[error.code];
}
