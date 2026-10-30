import { AdminApiError } from "../../lib/admin/session";

export interface AnimalPublishFailure {
  /** The `animalFormCopy.publish` message to show. */
  notice: "reviewRequired" | "conflict" | "unconfirmed";
  /** Whether the preview can still be published once the cause is fixed. */
  keepPreview: boolean;
}

/**
 * What the editor shows when a publish fails. A missing approved source review
 * (`review_required`) is not a stale draft: previewing again cannot help until the
 * saved version is reviewed, and the preview stays valid for the same revision (BUG-54).
 */
export function animalPublishFailure(error: unknown): AnimalPublishFailure {
  if (error instanceof AdminApiError && error.status === 422 && error.code === "review_required")
    return { notice: "reviewRequired", keepPreview: true };
  if (error instanceof AdminApiError && [403, 404, 409, 422].includes(error.status))
    return { notice: "conflict", keepPreview: false };
  // A lost HTTP response may follow a committed publish. Keep the preview ID so
  // the idempotent publish command can be retried.
  return { notice: "unconfirmed", keepPreview: true };
}
