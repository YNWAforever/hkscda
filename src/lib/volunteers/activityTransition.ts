import type { VolunteerActivityStatus } from "./types";

/**
 * A status change the legacy activity table must not make (OPS-01). `cancelled` and `closed`
 * are both terminal for republish: the legacy PATCH accepted `{"status":"published"}` on any
 * row, so one click resurrected a terminal session on the public volunteer list without
 * re-evaluating capacity or writing a cancellation audit. The RPC refuses both the same way.
 */
export class VolunteerActivityTransitionError extends Error {
  constructor(readonly code: "activity_closed") {
    super(code);
    this.name = "VolunteerActivityTransitionError";
  }
}

/**
 * Refuses republishing from a terminal state: a cancelled or closed activity cannot be
 * published again (same `activity_closed` refusal the RPC uses). Closing or editing a
 * cancelled row stays allowed; closed → published does not.
 */
export function assertActivityStatusTransition(
  current: VolunteerActivityStatus,
  next: VolunteerActivityStatus | undefined,
) {
  if ((current === "cancelled" || current === "closed") && next === "published") {
    throw new VolunteerActivityTransitionError("activity_closed");
  }
}
