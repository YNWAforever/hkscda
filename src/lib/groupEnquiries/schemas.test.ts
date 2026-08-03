import { describe, expect, test } from "bun:test";

import { publicGroupEnquirySchema } from "./schemas";

describe("group enquiry schemas", () => {
  test("normalizes public group enquiry payloads and strips public-only internals", () => {
    const parsed = publicGroupEnquirySchema.parse({
      organisationName: "  Happy School  ",
      contactPerson: "  Ms Chan  ",
      email: "LEAD@example.COM ",
      phone: " +852 9123 4567 ",
      activityType: "school_talk",
      otherActivityDescription: " should be stripped ",
      participantCount: "30",
      participantAgeProfile: " P4-P6 ",
      preferredDateNotes: " Friday afternoons ",
      message: "  Please call before email.  ",
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      turnstileToken: "token",
      status: "closed",
      notificationStatus: "sent",
    });

    expect(parsed).toMatchObject({
      organisationName: "Happy School",
      contactPerson: "Ms Chan",
      email: "lead@example.com",
      phone: "+85291234567",
      activityType: "school_talk",
      participantCount: 30,
      participantAgeProfile: "P4-P6",
      preferredDateNotes: "Friday afternoons",
      message: "Please call before email.",
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
    });
    expect(parsed.otherActivityDescription).toBeNull();
    expect("status" in parsed).toBe(false);
    expect("notificationStatus" in parsed).toBe(false);
  });

  test("requires other activity description only for other enquiries", () => {
    const base = {
      organisationName: "Happy School",
      contactPerson: "Ms Chan",
      email: "lead@example.com",
      phone: "91234567",
      participantCount: 30,
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      turnstileToken: "token",
    };

    expect(publicGroupEnquirySchema.safeParse({ ...base, activityType: "other" }).success).toBe(false);
    expect(
      publicGroupEnquirySchema.parse({
        ...base,
        activityType: "other",
        otherActivityDescription: "Animal care career talk",
      }).otherActivityDescription,
    ).toBe("Animal care career talk");
    expect(publicGroupEnquirySchema.safeParse({ ...base, activityType: "shelter_visit", participantCount: 0 }).success).toBe(false);
  });
});
