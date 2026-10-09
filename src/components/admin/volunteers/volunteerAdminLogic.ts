import type {
  VolunteerActivityStatus,
  VolunteerActivitySummary,
  VolunteerActivityType,
  VolunteerAttendanceStatus,
  VolunteerRegistrationStatus,
} from "../../../lib/volunteers/types";

export const VOLUNTEER_ADMIN_PAGE_SIZE = 25;

export type VolunteerActivityFilters = {
  q: string;
  status: VolunteerActivityStatus | "all" | "";
  type: VolunteerActivityType | "all" | "";
  page: number;
};

export type VolunteerRegistrationFilters = {
  q: string;
  status: VolunteerRegistrationStatus | "all" | "";
  attendanceStatus: VolunteerAttendanceStatus | "all" | "";
  activityId: string;
  page: number;
};

function addTrimmed(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) params.set(key, trimmed);
}

// The labels of the registration statuses are in `lib/volunteers/labels`, and those of the attendance
// statuses, registration types, activity statuses and activity types are in `volunteerCommonCopy`, so
// they can be shown in either language.

/**
 * Status transitions worth offering from the registration's current state.
 *
 * The old UI rendered all three buttons unconditionally, so "approve" showed on an
 * already-approved row and "reject" showed on one the volunteer had themselves
 * cancelled. Offering a transition that is a no-op — or that silently overrides
 * the volunteer's own decision — is what made the action bar unreadable.
 */
export function availableRegistrationTransitions(
  current: VolunteerRegistrationStatus,
): VolunteerRegistrationStatus[] {
  switch (current) {
    case "pending":
      return ["approved", "waitlisted", "rejected"];
    case "waitlisted":
      return ["approved", "rejected"];
    case "approved":
      return ["waitlisted", "rejected"];
    case "rejected":
      return ["approved"];
    // A volunteer-initiated cancellation is theirs to own; staff reversing it
    // behind their back would be worse than making them re-register.
    case "cancelled":
      return [];
  }
}

/** Destructive transitions get danger styling and a confirmation step. */
export function isDestructiveTransition(status: VolunteerRegistrationStatus) {
  return status === "rejected";
}

/**
 * Attendance is only meaningful once someone is approved and the activity has
 * actually started. Marking attendance on a pending or future booking records
 * something that did not happen.
 */
export function canMarkAttendance(
  registration: {
    status: VolunteerRegistrationStatus;
    attendanceStatus: VolunteerAttendanceStatus;
  },
  activityStartsAt: string | undefined,
  now = () => new Date(),
) {
  if (registration.status !== "approved") return false;
  if (registration.attendanceStatus === "completed") return false;
  if (!activityStartsAt) return false;
  const startsAt = new Date(activityStartsAt);
  if (Number.isNaN(startsAt.getTime())) return false;
  return startsAt.getTime() <= now().getTime();
}

export function buildActivitySearchParams(filters: VolunteerActivityFilters) {
  const params = new URLSearchParams();
  addTrimmed(params, "q", filters.q);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  params.set("page", String(Math.max(1, filters.page || 1)));
  params.set("pageSize", String(VOLUNTEER_ADMIN_PAGE_SIZE));
  return params;
}

export function buildRegistrationSearchParams(filters: VolunteerRegistrationFilters) {
  const params = new URLSearchParams();
  addTrimmed(params, "q", filters.q);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.attendanceStatus && filters.attendanceStatus !== "all") {
    params.set("attendanceStatus", filters.attendanceStatus);
  }
  addTrimmed(params, "activityId", filters.activityId);
  params.set("page", String(Math.max(1, filters.page || 1)));
  params.set("pageSize", String(VOLUNTEER_ADMIN_PAGE_SIZE));
  return params;
}

export function summarizeActivityCapacity(
  activity: Pick<
    VolunteerActivitySummary,
    "capacity" | "approvedParticipants" | "pendingParticipants" | "waitlistedParticipants"
  >,
) {
  return {
    approved: activity.approvedParticipants,
    remaining: Math.max(0, activity.capacity - activity.approvedParticipants),
    pending: activity.pendingParticipants,
    waitlisted: activity.waitlistedParticipants,
    percentFull: Math.min(
      100,
      Math.round((activity.approvedParticipants / activity.capacity) * 100),
    ),
  };
}

export function volunteerStatusTone(status: VolunteerRegistrationStatus) {
  if (status === "approved") return "success";
  if (status === "waitlisted" || status === "pending") return "warning";
  if (status === "rejected" || status === "cancelled") return "danger";
  return "default";
}
