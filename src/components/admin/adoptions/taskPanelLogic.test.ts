import { describe, expect, test } from "bun:test";

import type { CoordinatorStatus } from "../../../lib/adoptions/types";
import {
  buildCreateTaskPayload,
  buildUpdateTaskPayload,
  datetimeLocalToIso,
  getDefaultFollowupStatusId,
  isoToDatetimeLocal,
  statusesForTaskControl,
} from "./taskPanelLogic";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "status-1",
    category: "followup",
    key: "pending",
    labelZh: "待辦",
    labelEn: "Pending",
    sortOrder: 1,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

describe("task panel logic", () => {
  test("prefers scheduled then pending as the default active follow-up status", () => {
    expect(
      getDefaultFollowupStatusId([
        status({ id: "pending", key: "pending", sortOrder: 2 }),
        status({ id: "scheduled", key: "scheduled", sortOrder: 3 }),
      ]),
    ).toBe("scheduled");

    expect(
      getDefaultFollowupStatusId([
        status({ id: "review", key: "review", sortOrder: 1 }),
        status({ id: "pending", key: "pending", sortOrder: 2 }),
      ]),
    ).toBe("pending");
  });

  test("falls back to the first active follow-up status by sort order", () => {
    expect(
      getDefaultFollowupStatusId([
        status({ id: "inactive-scheduled", key: "scheduled", isActive: false, sortOrder: 1 }),
        status({ id: "later", key: "later", sortOrder: 20 }),
        status({ id: "first", key: "first", sortOrder: 10 }),
        status({ id: "case-status", category: "adoption_case", sortOrder: 1 }),
      ]),
    ).toBe("first");
  });

  test("keeps an inactive current task status in selector options", () => {
    const inactiveCurrent = status({
      id: "inactive-current",
      key: "archived",
      isActive: false,
      sortOrder: 5,
    });

    expect(
      statusesForTaskControl(
        [
          status({ id: "active-later", sortOrder: 20 }),
          inactiveCurrent,
          status({ id: "active-first", sortOrder: 1 }),
        ],
        inactiveCurrent,
      ).map((item) => item.id),
    ).toEqual(["active-first", "inactive-current", "active-later"]);
  });

  test("converts ISO datetimes to datetime-local input values", () => {
    expect(isoToDatetimeLocal("2026-06-01T12:30:00.000Z")).toBe("2026-06-01T12:30");
    expect(isoToDatetimeLocal(null)).toBe("");
    expect(isoToDatetimeLocal("not-a-date")).toBe("");
  });

  test("converts datetime-local input values to ISO strings and nullable clears", () => {
    expect(datetimeLocalToIso("2026-06-01T20:30", "omit")).toBe("2026-06-01T20:30:00.000Z");
    expect(datetimeLocalToIso(" ", "omit")).toBeUndefined();
    expect(datetimeLocalToIso("", "null")).toBeNull();
    expect(datetimeLocalToIso("not-a-date", "null")).toBeNull();
  });

  test("builds a trimmed case-linked follow-up create payload", () => {
    expect(
      buildCreateTaskPayload({
        adoptionCaseId: "case-1",
        statusId: "status-1",
        title: " First call ",
        priority: "high",
        dueAt: "2026-06-01T20:30",
        scheduledAt: "",
        volunteer: " Ada ",
        contactChannel: "whatsapp",
        remarks: " Bring notes ",
      }),
    ).toEqual({
      adoptionCaseId: "case-1",
      statusId: "status-1",
      title: "First call",
      taskType: "followup",
      priority: "high",
      dueAt: "2026-06-01T20:30:00.000Z",
      volunteer: "Ada",
      contactChannel: "whatsapp",
      remarks: "Bring notes",
    });
  });

  test("returns null create payload when required fields are missing", () => {
    expect(
      buildCreateTaskPayload({
        adoptionCaseId: "case-1",
        statusId: "",
        title: " First call ",
        priority: "normal",
        dueAt: "",
        scheduledAt: "",
        volunteer: "",
        contactChannel: "",
        remarks: "",
      }),
    ).toBeNull();
  });

  test("builds an update payload with nullable cleared fields", () => {
    expect(
      buildUpdateTaskPayload({
        statusId: "status-2",
        priority: "urgent",
        dueAt: "",
        scheduledAt: "2026-06-02T09:00",
        completedAt: "",
        volunteer: " ",
        contactChannel: "",
        outcome: " Completed ",
        nextStepAt: "",
        remarks: " ",
      }),
    ).toEqual({
      statusId: "status-2",
      priority: "urgent",
      dueAt: null,
      scheduledAt: "2026-06-02T09:00:00.000Z",
      completedAt: null,
      volunteer: null,
      contactChannel: null,
      outcome: "Completed",
      nextStepAt: null,
      remarks: null,
    });
  });
});
