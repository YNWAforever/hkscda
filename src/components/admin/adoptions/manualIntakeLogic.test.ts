import { describe, expect, test } from "bun:test";

import type { CoordinatorStatus } from "../../../lib/adoptions/types";
import {
  buildManualCasePayload,
  buildIdentitySearchParams,
  intakeCaseStatuses,
} from "./manualIntakeLogic";

describe("manual intake logic", () => {
  test("BUG-41: the initial status list offers only active, non-closing case statuses", () => {
    function caseStatus(key: string, overrides: Partial<CoordinatorStatus> = {}) {
      return {
        id: key,
        category: "adoption_case",
        key,
        labelZh: key,
        labelEn: key,
        sortOrder: 10,
        color: "blue",
        isActive: true,
        isSystem: true,
        isClosing: false,
        isFinal: false,
        ...overrides,
      } satisfies CoordinatorStatus;
    }

    const statuses = [
      caseStatus("new"),
      caseStatus("screening", { isActive: false }),
      caseStatus("approved", { isClosing: true, isFinal: true }),
      caseStatus("rejected", { isClosing: true, isFinal: true }),
      caseStatus("contacted"),
    ];

    expect(intakeCaseStatuses(statuses).map((status) => status.key)).toEqual(["new", "contacted"]);
    expect(intakeCaseStatuses(undefined)).toEqual([]);
  });

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
