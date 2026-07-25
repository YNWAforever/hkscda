import { describe, expect, test } from "bun:test";

import {
  ACTIVITY_LABELS,
  buildGroupEnquiryPayload,
  shouldShowOtherActivityDescription,
} from "./GroupEnquiryForm";

describe("GroupEnquiryForm helpers", () => {
  test("uses the approved activity labels", () => {
    expect(ACTIVITY_LABELS).toEqual({
      group_workshop: "團體義工工作坊",
      school_talk: "入校講座",
      shelter_visit: "貓狗舍教育參觀活動",
      other: "其他活動查詢",
    });
  });

  test("builds a retry-safe payload with one stable idempotency key", () => {
    const payload = buildGroupEnquiryPayload({
      organisationName: " Happy School ",
      contactPerson: " Ms Chan ",
      email: "LEAD@example.COM ",
      phone: " 9123 4567 ",
      activityType: "school_talk",
      otherActivityDescription: " should not be sent ",
      participantCount: "30",
      participantAgeProfile: " P4-P6 ",
      preferredDateNotes: " Friday afternoons ",
      message: " Please call before email. ",
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      turnstileToken: "token",
    });

    expect(payload).toEqual({
      organisationName: "Happy School",
      contactPerson: "Ms Chan",
      email: "lead@example.com",
      phone: "9123 4567",
      activityType: "school_talk",
      otherActivityDescription: undefined,
      participantCount: 30,
      participantAgeProfile: "P4-P6",
      preferredDateNotes: "Friday afternoons",
      message: "Please call before email.",
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      turnstileToken: "token",
    });
  });

  test("requires the other activity text only for other enquiries", () => {
    expect(shouldShowOtherActivityDescription("other")).toBe(true);
    expect(shouldShowOtherActivityDescription("school_talk")).toBe(false);
  });
});
