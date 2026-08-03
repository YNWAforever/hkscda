import { describe, expect, test } from "bun:test";

import {
  availableEnquiryTransitions,
  buildGroupEnquirySearchParams,
  groupEnquiryActivityLabels,
  groupEnquiryNotificationLabels,
  groupEnquiryStatusLabels,
  GROUP_ENQUIRY_PAGE_SIZE,
} from "./groupEnquiryAdminLogic";

describe("group enquiry labels", () => {
  test("labels every enum value in Chinese", () => {
    // These were rendered raw on buttons and in table cells.
    for (const status of ["new", "in_progress", "resolved", "closed"] as const) {
      expect(groupEnquiryStatusLabels[status]).toMatch(/[一-鿿]/);
    }
    for (const type of ["group_workshop", "school_talk", "shelter_visit", "other"] as const) {
      expect(groupEnquiryActivityLabels[type]).toMatch(/[一-鿿]/);
    }
    for (const status of ["pending", "sent", "failed"] as const) {
      expect(groupEnquiryNotificationLabels[status]).toMatch(/[一-鿿]/);
    }
  });
});

describe("group enquiry transitions", () => {
  test("never offers the status the enquiry is already in", () => {
    for (const status of ["new", "in_progress", "resolved", "closed"] as const) {
      expect(availableEnquiryTransitions(status)).not.toContain(status);
    }
  });

  test("offers all three working statuses for a new enquiry", () => {
    expect(availableEnquiryTransitions("new")).toEqual(["in_progress", "resolved", "closed"]);
  });
});

describe("group enquiry search params", () => {
  test("carries the requested page rather than pinning to the first", () => {
    // The screen hard-coded page: "1", so rows past the first page were
    // fetched by nobody and reachable by no one.
    expect(buildGroupEnquirySearchParams({ q: "", status: "all", page: 3 }).get("page")).toBe("3");
    expect(buildGroupEnquirySearchParams({ q: "", status: "all", page: 1 }).get("pageSize")).toBe(
      String(GROUP_ENQUIRY_PAGE_SIZE),
    );
  });

  test("omits blank query and the 'all' status sentinel", () => {
    const params = buildGroupEnquirySearchParams({ q: "   ", status: "all", page: 1 });
    expect(params.get("q")).toBeNull();
    expect(params.get("status")).toBeNull();
  });

  test("trims the query and passes a real status through", () => {
    const params = buildGroupEnquirySearchParams({
      q: "  聖士提反  ",
      status: "resolved",
      page: 1,
    });
    expect(params.get("q")).toBe("聖士提反");
    expect(params.get("status")).toBe("resolved");
  });

  test("clamps a nonsense page to the first", () => {
    expect(buildGroupEnquirySearchParams({ q: "", status: "all", page: 0 }).get("page")).toBe("1");
    expect(buildGroupEnquirySearchParams({ q: "", status: "all", page: -5 }).get("page")).toBe("1");
  });
});
