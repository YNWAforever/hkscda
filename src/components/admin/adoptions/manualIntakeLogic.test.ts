import { describe, expect, test } from "bun:test";

import { buildManualCasePayload, buildIdentitySearchParams } from "./manualIntakeLogic";

describe("manual intake logic", () => {
  test("builds trimmed identity search params", () => {
    expect(buildIdentitySearchParams({ q: " Ada ", page: 2 }).toString()).toBe(
      "q=Ada&page=2&pageSize=10",
    );
  });

  test("builds an existing adopter manual case payload with optional task", () => {
    expect(
      buildManualCasePayload({
        identity: {
          kind: "existing_adopter",
          adopterProfileId: "55555555-6666-4333-8444-555555555555",
        },
        caseForm: {
          initialStatusId: "33333333-4444-4333-8444-555555555555",
          animalType: "cat",
          applicantName: " Ada ",
          applicantPhone: " 9123 4567 ",
          applicantEmail: "",
          applicantAddress: " HK ",
          housingType: "",
          familySize: "3",
          existingPets: "",
          reason: " Phone intake ",
          preferenceNotes: " quiet ",
        },
        initialTask: {
          enabled: true,
          statusId: "33333333-4444-4333-8444-555555555555",
          title: " Call back ",
          priority: "high",
          dueAt: "",
          assignedTo: "",
          volunteer: " May ",
          contactChannel: "phone",
          remarks: " Confirm ",
        },
      }),
    ).toMatchObject({
      identity: { kind: "existing_adopter" },
      case: {
        applicantName: "Ada",
        familySize: 3,
        preferences: { notes: "quiet" },
      },
      initialTask: {
        title: "Call back",
        priority: "high",
        volunteer: "May",
      },
    });
  });
});
