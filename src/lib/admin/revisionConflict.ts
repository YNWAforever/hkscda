import { AdminApiError } from "./session";

/**
 * Whether an admin API refusal is an optimistic-concurrency conflict: the row changed since this
 * screen loaded it (the API answers 409 with code `conflict`, from the SQL `40001` the revision
 * fences raise). The four simple content editors show their reload-latest notice for this, not the
 * generic save-failure line.
 */
export function isRevisionConflict(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 409 && error.code === "conflict";
}
