import { describe, expect, test } from "bun:test";

import {
  buildActivitySearchParams,
  buildRegistrationSearchParams,
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
