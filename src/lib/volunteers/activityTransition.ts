import type { VolunteerActivityStatus } from "./types";

/**
 * A status change the legacy activity table must not make (OPS-01). `cancelled` is the
 * terminal state the bulk cancel flow writes: it needs a required reason, cancels the
 * registrations and audits them, and the public list drops the session. The legacy PATCH
 * accepted `{"status":"published"}` on any row, so one click resurrected a cancelled session
 * on the public volunteer list without re-evaluating capacity or writing a cancellation audit.
 */
export class VolunteerActivityTransitionError extends Error {
  constructor(readonly code: "activity_closed") {
    super(code);
    this.name = "VolunteerActivityTransitionError";
  }
}

/**
 * Refuses the one transition that escapes a terminal state: a cancelled activity cannot be
 * published again. Closing or editing a cancelled row stays allowed, and re-publishing a
 * closed (not cancelled) session is the normal reopening.
 */
export function assertActivityStatusTransition(
  current: VolunteerActivityStatus,
  next: VolunteerActivityStatus | undefined,
) {
  if (current === "cancelled" && next === "published") {
    throw new VolunteerActivityTransitionError("activity_closed");
  }
}
