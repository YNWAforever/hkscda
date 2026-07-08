import { describe, expect, test } from "bun:test";

import {
  adopterSearchSchema,
  animalPipelineSearchSchema,
  caseSearchSchema,
  coordinatorExportKindSchema,
  coordinatorMonthlySummarySearchSchema,
  coordinatorReportHistorySearchSchema,
  coordinatorTaskInputSchema,
  coordinatorTaskUpdateSchema,
  manualCaseIntakeSchema,
  statusInputSchema,
} from "./schemas";

const statusId = "11111111-2222-4333-8444-555555555555";
const adoptionCaseId = "22222222-3333-4333-8444-555555555555";
const manualAdopterProfileId = "55555555-6666-4333-8444-555555555555";
const manualSupporterId = "22222222-3333-4333-8444-555555555555";

const baseManualCase = {
  initialStatusId: statusId,
  animalType: "cat",
  applicantName: " Ada ",
  applicantPhone: " 9123 4567 ",
  applicantEmail: " ada@example.test ",
  applicantAddress: " HK Island ",
  housingType: "private",
  familySize: "3",
  existingPets: "",
  reason: "Manual phone intake",
  preferences: { note: "quiet cat" },
};

describe("adoption coordinator schemas", () => {
  test("normalizes case search defaults", () => {
    expect(caseSearchSchema.parse({ q: " Ada ", page: "0", pageSize: "500" })).toEqual({
      q: "Ada",
      animalType: undefined,
      openOnly: false,
      page: 1,
      pageSize: 25,
    });
  });

  test("parses open-only search filters safely", () => {
    expect(caseSearchSchema.parse({ openOnly: "false" }).openOnly).toBe(false);
    expect(caseSearchSchema.parse({ openOnly: "0" }).openOnly).toBe(false);
    expect(caseSearchSchema.parse({ openOnly: "true" }).openOnly).toBe(true);
    expect(caseSearchSchema.parse({ openOnly: "1" }).openOnly).toBe(true);
  });

  test("normalizes adopter search defaults and boolean filters", () => {
    expect(
      adopterSearchSchema.parse({
        q: " Ada ",
        blacklisted: "yes",
        hasOpenCases: "true",
        hasOpenTasks: "1",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      q: "Ada",
      blacklisted: "yes",
      hasOpenCases: true,
      hasOpenTasks: true,
      page: 2,
      pageSize: 50,
    });

    expect(adopterSearchSchema.parse({})).toEqual({
      q: undefined,
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: false,
      page: 1,
      pageSize: 25,
    });
  });

  test("normalizes animal pipeline search filters", () => {
    expect(
      animalPipelineSearchSchema.parse({
        q: " Mochi ",
        animalId: "77777777-8888-4333-8444-555555555555",
        status: "available",
        type: "cat",
        adoptable: "not_adoptable",
        supportPool: "inside",
        positionId: "none",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      q: "Mochi",
      animalId: "77777777-8888-4333-8444-555555555555",
      status: "available",
      type: "cat",
      adoptable: "not_adoptable",
      supportPool: "inside",
      positionId: "none",
      page: 2,
      pageSize: 50,
    });

    expect(animalPipelineSearchSchema.parse({ page: "0", pageSize: "500" })).toEqual({
      q: undefined,
      animalId: undefined,
      status: "all",
      type: "all",
      adoptable: "all",
      supportPool: "all",
      positionId: "all",
      page: 1,
      pageSize: 25,
    });
  });

  test("accepts only supported coordinator export kinds", () => {
    expect(coordinatorExportKindSchema.parse("cases")).toBe("cases");
    expect(coordinatorExportKindSchema.parse("adopters")).toBe("adopters");
    expect(coordinatorExportKindSchema.parse("successful-adoptions")).toBe("successful-adoptions");
    expect(coordinatorExportKindSchema.parse("animals")).toBe("animals");
    expect(coordinatorExportKindSchema.parse("tasks")).toBe("tasks");
    expect(() => coordinatorExportKindSchema.parse("payments")).toThrow();
  });

  test("accepts manual intake with one existing adopter identity", () => {
    expect(
      manualCaseIntakeSchema.parse({
        identity: { kind: "existing_adopter", adopterProfileId: manualAdopterProfileId },
        case: baseManualCase,
      }),
    ).toMatchObject({
      identity: { kind: "existing_adopter", adopterProfileId: manualAdopterProfileId },
      case: {
        applicantName: "Ada",
        applicantPhone: "9123 4567",
        familySize: 3,
        existingPets: undefined,
      },
    });
  });

  test("accepts manual intake with existing supporter identity and optional initial task", () => {
    expect(
      manualCaseIntakeSchema.parse({
        identity: {
          kind: "existing_supporter",
          supporterId: manualSupporterId,
          adopterProfile: {
            nameEnglish: "Ada",
            address: "HK Island",
            householdSize: "3",
          },
        },
        case: baseManualCase,
        initialTask: {
          statusId,
          title: "Call back",
          priority: "high",
          dueAt: "2026-06-30T02:00:00.000Z",
          contactChannel: "phone",
          remarks: "Confirm window net",
        },
      }),
    ).toMatchObject({
      identity: { kind: "existing_supporter", supporterId: manualSupporterId },
      initialTask: { title: "Call back", priority: "high" },
    });
  });

  test("rejects ambiguous manual intake identity", () => {
    expect(() =>
      manualCaseIntakeSchema.parse({
        identity: {
          kind: "existing_adopter",
          adopterProfileId: manualAdopterProfileId,
          supporterId: manualSupporterId,
        },
        case: baseManualCase,
      }),
    ).toThrow();
  });

  test("normalizes coordinator report filters", () => {
    expect(
      coordinatorReportHistorySearchSchema.parse({
        month: "2026-06",
        kind: "cases",
        actor: " Ada ",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      month: "2026-06",
      kind: "cases",
      actor: "Ada",
      page: 2,
      pageSize: 50,
    });

    expect(coordinatorMonthlySummarySearchSchema.parse({ month: "2026-06" })).toEqual({
      month: "2026-06",
    });
  });

  test("rejects invalid status keys", () => {
    expect(() =>
      statusInputSchema.parse({
        category: "adoption_case",
        key: "已批准",
        labelZh: "已批准",
        labelEn: "Approved",
      }),
    ).toThrow();
  });

  test("defaults missing and blank task type on create schemas", () => {
    expect(
      coordinatorTaskInputSchema.parse({
        adoptionCaseId,
        title: " Home visit ",
        statusId,
      }).taskType,
    ).toBe("followup");
    expect(
      coordinatorTaskInputSchema.parse({
        adoptionCaseId,
        title: "Home visit",
        statusId,
        taskType: "   ",
      }).taskType,
    ).toBe("followup");
  });

  test("rejects task updates without a meaningful parsed value", () => {
    expect(() => coordinatorTaskUpdateSchema.parse({})).toThrow("Task update cannot be empty");
    expect(() => coordinatorTaskUpdateSchema.parse({ assignedTo: "   " })).toThrow(
      "Task update cannot be empty",
    );
    expect(() => coordinatorTaskUpdateSchema.parse({ taskType: "   " })).toThrow(
      "Task update cannot be empty",
    );

    expect(coordinatorTaskUpdateSchema.parse({ assignedTo: " Ada " })).toEqual({
      assignedTo: "Ada",
    });
    expect(coordinatorTaskUpdateSchema.parse({ assignedTo: null })).toEqual({
      assignedTo: null,
    });
  });
});
