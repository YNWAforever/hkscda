export type FailureClass = "session" | "forbidden" | "not_found" | "server" | "network" | "unknown";

function classOfStatus(error: unknown): FailureClass | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const status = (error as { status: unknown }).status;
  if (status === null) return "network";
  if (typeof status !== "number") return null;
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 500 && status <= 599) return "server";
  return null;
}

/**
 * Which kind of failure `error` is, from the HTTP status `fetchAdminJson` puts on what it
 * throws: 401 (which is also what an `AdminSessionError` carries, so a lapsed or changed session
 * of any kind) is "session", 403 is "forbidden", 404 is "not_found", 5xx is "server", a request
 * that never got a response (status `null`) is "network". An error with no status of its own is
 * classified by its `cause`, one level down, so a wrapper such as `PipelineLookupError` reads as
 * what it wraps. Anything else is "unknown".
 */
export function failureClass(error: unknown): FailureClass {
  const own = classOfStatus(error);
  if (own) return own;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return classOfStatus((error as { cause: unknown }).cause) ?? "unknown";
  }
  return "unknown";
}

/**
 * Whether `error` itself says the session has lapsed: an `AdminSessionError` or anything else
 * carrying status 401. The expiry redirect and the query retry policy share this one rule.
 */
export function isLapsedSession(error: unknown): boolean {
  return classOfStatus(error) === "session";
}

/** React Query's own default number of query retries in the browser. */
const QUERY_RETRIES = 3;

/**
 * The query retry policy: up to three retries as React Query would do by default, but none for
 * a lapsed session, which a retry cannot fix and which only delays the sign-in redirect.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < QUERY_RETRIES && !isLapsedSession(error);
}
