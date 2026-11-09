import { describe, expect, test } from "bun:test";

import type { CoordinatorStatus } from "../../../lib/adoptions/types";
import { adminPageCopy } from "../adminPageCopy";
import {
  buildManualCasePayload,
  buildIdentitySearchParams,
  canSearchIdentity,
  candidateContactPrefill,
  codedManualIntakeErrorMessage,
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

  test("BUG-37: identity search starts at three characters", () => {
    expect(canSearchIdentity("")).toBe(false);
    expect(canSearchIdentity(" ab ")).toBe(false);
    expect(canSearchIdentity("abc")).toBe(true);
    expect(canSearchIdentity(" 陳大文 ")).toBe(true);
  });

  test("BUG-37: a masked supporter's contact is not copied into the case", () => {
    const candidate = {
      kind: "supporter" as const,
      supporterId: "s1",
      adopterProfileId: null,
      displayName: "Ada",
      email: "a***@example.com",
      phone: "****5678",
      isBlacklisted: false,
      latestCaseAt: null,
    };
    expect(candidateContactPrefill({ ...candidate, contactMasked: true })).toEqual({
      phone: "",
      email: "",
    });
    expect(
      candidateContactPrefill({
        ...candidate,
        email: "ada@example.com",
        phone: "91235678",
        contactMasked: false,
      }),
    ).toEqual({ phone: "91235678", email: "ada@example.com" });
  });

  test("BUG-37: the intake screen searches only from the minimum and says so", async () => {
    const source = await Bun.file("src/components/admin/adoptions/ManualCaseIntake.tsx").text();
    expect(source).toContain("enabled: canSearchIdentity(searchText)");
    expect(source).toContain("copy.identitySearchTooShort");
    expect(source).toContain("candidateContactPrefill(candidate)");
  });

  test("OPS-04: a supporter_archived failure shows actionable copy in both languages", () => {
    const error = {
      status: 409,
      code: "supporter_archived",
      message:
        "This email belongs to an archived supporter. Ask a treasurer or admin to unarchive that supporter, or record the intake without the email.",
    };
    const zh = adminPageCopy.zh.manualIntake.serverErrors;
    const en = adminPageCopy.en.manualIntake.serverErrors;

    expect(codedManualIntakeErrorMessage(error, zh)).toBe(zh.supporter_archived);
    expect(codedManualIntakeErrorMessage(error, en)).toBe(en.supporter_archived);
    expect(zh.supporter_archived).toContain("已封存");
    expect(zh.supporter_archived).toContain("司庫或管理員");
    expect(zh.supporter_archived).toContain("不填寫電郵");
    expect(en.supporter_archived).toContain("archived supporter");
    expect(en.supporter_archived).toContain("treasurer or admin");
    expect(en.supporter_archived).toContain("without the email");
  });

  test("OPS-04: failures without a mapped code keep the server's own message", () => {
    const en = adminPageCopy.en.manualIntake.serverErrors;
    expect(codedManualIntakeErrorMessage(new Error("A supporter already exists"), en)).toBeNull();
    expect(codedManualIntakeErrorMessage({ status: 409, code: "supporter_exists" }, en)).toBeNull();
    expect(codedManualIntakeErrorMessage(null, en)).toBeNull();
    expect(codedManualIntakeErrorMessage(undefined, en)).toBeNull();
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
