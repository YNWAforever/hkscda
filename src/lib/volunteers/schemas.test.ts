import { describe, expect, test } from "bun:test";

import {
  adminActivityInputSchema,
  publicRegistrationSchema,
  volunteerActivitySearchSchema,
} from "./schemas";

describe("volunteer schemas", () => {
  test("normalizes public individual registration payloads", () => {
    const parsed = publicRegistrationSchema.parse({
      activityId: "f43d0f00-aa4f-4bb9-856d-6fe2f9f13bd0",
      registrationType: "individual",
      contact: {
        name: "  陳小明  ",
        email: "MING@example.COM ",
        phone: " 9123 4567 ",
        language: "zh-HK",
      },
      participantCount: 1,
      declaredAge: "18",
      consents: { email: true, whatsapp: false },
      turnstileToken: "token",
    });

    expect(parsed.contact).toMatchObject({
      name: "陳小明",
      email: "ming@example.com",
      phone: "9123 4567",
    });
    expect(parsed.declaredAge).toBe(18);
    expect(parsed.participantCount).toBe(1);
  });

  test("requires organization and supervisor details for group registrations", () => {
    const result = publicRegistrationSchema.safeParse({
      activityId: "f43d0f00-aa4f-4bb9-856d-6fe2f9f13bd0",
      registrationType: "group",
      contact: {
        name: "Group Lead",
        email: "lead@example.com",
        phone: "91234567",
        language: "zh-HK",
      },
      participantCount: 8,
      youngestAge: 15,
      consents: { email: true },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("organizationName");
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("guardianName");
  });

  test("normalizes admin activity drafts with defaults", () => {
    const parsed = adminActivityInputSchema.parse({
      type: "cleaning_day",
      title: "  七月清潔日  ",
      description: "清潔貓舍",
      startsAt: "2026-08-01T02:00:00.000Z",
      endsAt: "2026-08-01T05:00:00.000Z",
      location: "荃灣",
      capacity: "20",
      minAge: "16",
      registrationModes: ["individual", "group"],
    });

    expect(parsed).toMatchObject({
      title: "七月清潔日",
      capacity: 20,
      minAge: 16,
      status: "draft",
      autoApprove: false,
      allowWaitlist: true,
      underagePolicy: "allow_with_guardian_pending",
    });
  });

  test("keeps activity list filters bounded", () => {
    expect(volunteerActivitySearchSchema.parse({ status: "published", pageSize: "80" })).toEqual({
      status: "published",
      type: undefined,
      q: undefined,
      page: 1,
      pageSize: 50,
    });
  });
});
