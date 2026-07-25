import { describe, expect, test } from "bun:test";

import {
  decideVolunteerRegistrationStatus,
  formatVolunteerReference,
  validateAttendanceTransition,
} from "./rules";
import type { VolunteerActivityRuleSnapshot, VolunteerRegistrationDraft } from "./types";

const baseActivity: VolunteerActivityRuleSnapshot = {
  id: "activity-1",
  status: "published",
  startsAt: "2026-08-10T02:00:00.000Z",
  capacity: 12,
  approvedParticipants: 4,
  waitlistedParticipants: 0,
  allowWaitlist: true,
  autoApprove: true,
  minAge: 16,
  underagePolicy: "allow_with_guardian_pending",
  registrationModes: ["individual", "group"],
};

const individualDraft: VolunteerRegistrationDraft = {
  registrationType: "individual",
  participantCount: 1,
  declaredAge: 21,
  guardianName: null,
  guardianPhone: null,
};

describe("volunteer registration rules", () => {
  test("auto approves eligible registrations when the activity allows it", () => {
    expect(
      decideVolunteerRegistrationStatus({
        activity: baseActivity,
        draft: individualDraft,
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "approved", reason: "auto_approved" });
  });

  test("counts group capacity by people and waitlists overflow", () => {
    expect(
      decideVolunteerRegistrationStatus({
        activity: baseActivity,
        draft: {
          registrationType: "group",
          participantCount: 10,
          declaredAge: null,
          youngestAge: 17,
          guardianName: "Teacher Chan",
          guardianPhone: "91234567",
        },
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "waitlisted", reason: "capacity_full" });
  });

  test("keeps underage registrations pending when guardian review is required", () => {
    expect(
      decideVolunteerRegistrationStatus({
        activity: baseActivity,
        draft: {
          registrationType: "group",
          participantCount: 1,
          declaredAge: null,
          youngestAge: 14,
          guardianName: "Parent Lee",
          guardianPhone: "92345678",
        },
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "pending", reason: "guardian_review_required" });
  });

  test("rejects blocked underage registrations before capacity checks", () => {
    expect(
      decideVolunteerRegistrationStatus({
        activity: { ...baseActivity, underagePolicy: "block", approvedParticipants: 12 },
        draft: { ...individualDraft, declaredAge: 12 },
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "rejected", reason: "minimum_age_not_met" });
  });

  test("prevents attendance from being marked before approval", () => {
    expect(() => validateAttendanceTransition("pending", "attended")).toThrow(
      /approved registration/i,
    );
    expect(validateAttendanceTransition("approved", "completed")).toBe("completed");
  });

  test("formats short public volunteer references", () => {
    expect(formatVolunteerReference("f43d0f00-aa4f-4bb9-856d-6fe2f9f13bd0")).toBe("VOL-F43D0F00");
  });
  test("rejects individual applicants below the public age floor", () => {
    expect(
      decideVolunteerRegistrationStatus({
        activity: { ...baseActivity, minAge: 16, underagePolicy: "allow_with_guardian_pending" },
        draft: { ...individualDraft, declaredAge: 20, guardianName: "Parent Lee", guardianPhone: "92345678" },
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toEqual({ status: "rejected", reason: "minimum_age_not_met" });
  });
});
