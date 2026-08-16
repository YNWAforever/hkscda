import { describe, expect, test } from "bun:test";

import {
  availableRegistrationTransitions,
  buildActivitySearchParams,
  buildRegistrationSearchParams,
  canMarkAttendance,
  isDestructiveTransition,
  registrationStatusLabels,
  summarizeActivityCapacity,
  volunteerStatusTone,
} from "./volunteerAdminLogic";

describe("volunteer admin logic", () => {
  test("builds bounded activity search params", () => {
    expect(
      buildActivitySearchParams({
        q: "  清潔 ",
        status: "published",
        type: "cleaning_day",
        page: 2,
      }).toString(),
    ).toBe("q=%E6%B8%85%E6%BD%94&status=published&type=cleaning_day&page=2&pageSize=25");
  });

  test("builds registration search params without blank filters", () => {
    expect(
      buildRegistrationSearchParams({
        q: " ",
        status: "approved",
        attendanceStatus: "completed",
        activityId: "activity-1",
        page: 0,
      }).toString(),
    ).toBe("status=approved&attendanceStatus=completed&activityId=activity-1&page=1&pageSize=25");
  });

  test("summarizes people-based capacity", () => {
    expect(
      summarizeActivityCapacity({
        capacity: 20,
        approvedParticipants: 12,
        pendingParticipants: 5,
        waitlistedParticipants: 3,
      }),
    ).toEqual({
      approved: 12,
      remaining: 8,
      pending: 5,
      waitlisted: 3,
      percentFull: 60,
    });
  });

  test("maps registration statuses to stable tones", () => {
    expect(volunteerStatusTone("approved")).toBe("success");
    expect(volunteerStatusTone("waitlisted")).toBe("warning");
    expect(volunteerStatusTone("rejected")).toBe("danger");
  });
});

describe("registration action availability", () => {
  test("never offers a transition to the status the row is already in", () => {
    // The old action bar rendered approve/waitlist/reject unconditionally, so
    // "批准" appeared on an already-approved row and did nothing when clicked.
    for (const status of ["pending", "approved", "waitlisted", "rejected", "cancelled"] as const) {
      expect(availableRegistrationTransitions(status)).not.toContain(status);
    }
  });

  test("offers the full triage set only while a registration is pending", () => {
    expect(availableRegistrationTransitions("pending")).toEqual([
      "approved",
      "waitlisted",
      "rejected",
    ]);
  });

  test("leaves a volunteer's own cancellation alone", () => {
    // Staff silently reversing a cancellation would re-book someone who opted
    // out. Making them re-register is the honest path.
    expect(availableRegistrationTransitions("cancelled")).toEqual([]);
  });

  test("allows reinstating a rejection", () => {
    expect(availableRegistrationTransitions("rejected")).toEqual(["approved"]);
  });

  test("marks rejection as the destructive transition", () => {
    expect(isDestructiveTransition("rejected")).toBe(true);
    expect(isDestructiveTransition("approved")).toBe(false);
    expect(isDestructiveTransition("waitlisted")).toBe(false);
  });

  test("labels every registration status in Chinese", () => {
    for (const status of ["pending", "approved", "waitlisted", "rejected", "cancelled"] as const) {
      expect(registrationStatusLabels[status]).toMatch(/[一-鿿]/);
    }
  });
});

describe("attendance marking", () => {
  const started = "2026-08-01T02:00:00.000Z";
  const now = () => new Date("2026-08-01T06:00:00.000Z");
  const approved = { status: "approved", attendanceStatus: "not_marked" } as const;

  test("allows marking once an approved registration's activity has started", () => {
    expect(canMarkAttendance(approved, started, now)).toBe(true);
  });

  test("refuses before the activity starts", () => {
    // Recording attendance for something that hasn't happened yet is a false
    // record, and volunteerHours downstream reads these rows.
    expect(canMarkAttendance(approved, "2026-08-02T02:00:00.000Z", now)).toBe(false);
  });

  test("refuses unless the registration is approved", () => {
    for (const status of ["pending", "waitlisted", "rejected", "cancelled"] as const) {
      expect(canMarkAttendance({ status, attendanceStatus: "not_marked" }, started, now)).toBe(
        false,
      );
    }
  });

  test("refuses to re-mark an already completed registration", () => {
    expect(
      canMarkAttendance({ status: "approved", attendanceStatus: "completed" }, started, now),
    ).toBe(false);
  });

  test("refuses when the activity time is missing or unparseable", () => {
    expect(canMarkAttendance(approved, undefined, now)).toBe(false);
    expect(canMarkAttendance(approved, "not-a-date", now)).toBe(false);
  });
});
