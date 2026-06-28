import { describe, expect, test } from "bun:test";

import {
  adopterSearchSchema,
  caseSearchSchema,
  coordinatorExportKindSchema,
  coordinatorTaskInputSchema,
  coordinatorTaskUpdateSchema,
  statusInputSchema,
} from "./schemas";

const statusId = "11111111-2222-4333-8444-555555555555";
const adoptionCaseId = "22222222-3333-4333-8444-555555555555";

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

  test("accepts only supported coordinator export kinds", () => {
    expect(coordinatorExportKindSchema.parse("cases")).toBe("cases");
    expect(coordinatorExportKindSchema.parse("adopters")).toBe("adopters");
    expect(coordinatorExportKindSchema.parse("successful-adoptions")).toBe("successful-adoptions");
    expect(coordinatorExportKindSchema.parse("animals")).toBe("animals");
    expect(coordinatorExportKindSchema.parse("tasks")).toBe("tasks");
    expect(() => coordinatorExportKindSchema.parse("payments")).toThrow();
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
