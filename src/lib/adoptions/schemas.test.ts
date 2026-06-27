import { describe, expect, test } from "bun:test";

import {
  caseSearchSchema,
  coordinatorTaskInputSchema,
  coordinatorTaskUpdateSchema,
  followupInputSchema,
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
    expect(
      followupInputSchema.parse({
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
