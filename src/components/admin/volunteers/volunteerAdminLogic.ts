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
