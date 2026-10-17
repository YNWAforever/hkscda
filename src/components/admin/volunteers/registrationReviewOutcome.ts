export type RegistrationReviewOutcome =
  | "saved"
  | "saved_refresh_failed"
  | "recovered"
  | "failed"
  | "unknown";

function responseStatus(error: unknown): number | null | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" || value === null ? value : undefined;
}

/**
 * A 4xx response proves the server rejected the command. A network error, a gateway failure
 * or an untagged error cannot distinguish "not saved" from "saved but response lost", so the
 * caller must read the registration before enabling another write.
 */
export function registrationReviewOutcome(input: {
  error: unknown;
  refreshed: boolean;
  requestedStatus: string;
  observedStatus: string | undefined;
}): RegistrationReviewOutcome {
  if (input.error === null || input.error === undefined)
    return input.refreshed ? "saved" : "saved_refresh_failed";

  const status = responseStatus(input.error);
  if (typeof status === "number" && status >= 400 && status < 500) return "failed";
  if (input.refreshed && input.observedStatus === input.requestedStatus) return "recovered";
  return "unknown";
}
