import type {
  VolunteerAttendanceStatus,
  VolunteerRegistrationDecision,
  VolunteerRegistrationDraft,
  VolunteerRegistrationStatus,
  VolunteerActivityRuleSnapshot,
} from "./types";

function participantAge(draft: VolunteerRegistrationDraft) {
  return draft.registrationType === "group" ? draft.youngestAge : draft.declaredAge;
}

function hasGuardianDetails(draft: VolunteerRegistrationDraft) {
  return Boolean(draft.guardianName?.trim() && draft.guardianPhone?.trim());
}

export function formatVolunteerReference(id: string) {
  return `VOL-${id
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

export function decideVolunteerRegistrationStatus(input: {
  activity: VolunteerActivityRuleSnapshot;
  draft: VolunteerRegistrationDraft;
  now?: Date;
}): VolunteerRegistrationDecision {
  const now = input.now ?? new Date();
  const { activity, draft } = input;

  if (activity.status !== "published" || new Date(activity.startsAt).getTime() <= now.getTime()) {
    return { status: "pending", reason: "activity_not_available" };
  }

  if (!activity.registrationModes.includes(draft.registrationType)) {
    return { status: "pending", reason: "registration_mode_unavailable" };
  }

  const age = participantAge(draft);
  if (activity.minAge !== null && age !== null && age !== undefined && age < activity.minAge) {
    if (activity.underagePolicy === "block") {
      return { status: "rejected", reason: "minimum_age_not_met" };
    }
    return hasGuardianDetails(draft)
      ? { status: "pending", reason: "guardian_review_required" }
      : { status: "pending", reason: "guardian_details_required" };
  }

  const remainingCapacity = activity.capacity - activity.approvedParticipants;
  if (draft.participantCount > remainingCapacity) {
    return activity.allowWaitlist
      ? { status: "waitlisted", reason: "capacity_full" }
      : { status: "pending", reason: "capacity_full" };
  }

  if (!activity.autoApprove) {
    return { status: "pending", reason: "manual_review" };
  }

  return { status: "approved", reason: "auto_approved" };
}

export function validateAttendanceTransition(
  registrationStatus: VolunteerRegistrationStatus,
  nextStatus: VolunteerAttendanceStatus,
) {
  if (nextStatus !== "not_marked" && registrationStatus !== "approved") {
    throw new Error("Attendance can only be marked for an approved registration");
  }
  return nextStatus;
}
