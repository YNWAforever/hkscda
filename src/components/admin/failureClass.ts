export type FailureClass = "forbidden" | "not_found" | "server" | "network" | "unknown";

/**
 * Which kind of failure `error` is, from the HTTP status `fetchAdminJson` puts on what it
 * throws: 401 and 403 are "forbidden" (a lapsed session is a 401), 404 is "not_found", 5xx is
 * "server", a request that never got a response (status `null`) is "network". Anything else,
 * including a value with no status, is "unknown".
 */
export function failureClass(error: unknown): FailureClass {
  if (typeof error !== "object" || error === null || !("status" in error)) return "unknown";
  const status = (error as { status: unknown }).status;
  if (status === null) return "network";
  if (typeof status !== "number") return "unknown";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 500 && status <= 599) return "server";
  return "unknown";
}
