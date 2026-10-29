/**
 * PostgREST answers 416 / PGRST103 when a page starts past the counted rows. For an
 * admin list that is an empty page, not a failure: it happens on a stale page number
 * after the last rows on the final page were filtered out or acted on (BUG-18).
 */
export function isRangeNotSatisfiable(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST103"
  );
}
