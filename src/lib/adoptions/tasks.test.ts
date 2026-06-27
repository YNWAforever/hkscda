import { describe, expect, test } from "bun:test";

import type { CoordinatorStatus, CoordinatorTask } from "./types";
import {
  buildTaskAuditAction,
  getTaskDueBucket,
  isTaskFinalStatus,
  sortCoordinatorTasks,
  validateTaskCompletion,
} from "./tasks";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "status-1",
    category: "followup",
    key: "open",
    labelZh: "待處理",
    labelEn: "Open",
    sortOrder: 10,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

function task(overrides: Partial<CoordinatorTask> = {}): CoordinatorTask {
  return {
    id: "task-1",
    title: "Home visit",
    status: status(),
    taskType: "followup",
    priority: "normal",
    dueAt: null,
    scheduledAt: null,
    completedAt: null,
    assignedTo: null,
    volunteer: null,
    contactChannel: null,
    outcome: null,
    nextStepAt: null,
    remarks: null,
    hasWindowNet: null,
    environment: null,
    score: null,
    createdAt: "2026-06-27T08:00:00.000Z",
    updatedAt: "2026-06-27T08:00:00.000Z",
    adoptionCase: null,
    adopterProfile: null,
    animal: null,
    ...overrides,
  };
}

describe("coordinator task helpers", () => {
  test("classifies due buckets against a fixed clock", () => {
    const now = new Date("2026-06-27T10:00:00.000Z");

    expect(getTaskDueBucket(task({ dueAt: "2026-06-26T23:59:00.000Z" }), now)).toBe("overdue");
    expect(getTaskDueBucket(task({ dueAt: "2026-06-27T09:59:00.000Z" }), now)).toBe("overdue");
    expect(getTaskDueBucket(task({ dueAt: "2026-06-27T13:00:00.000Z" }), now)).toBe("today");
    expect(getTaskDueBucket(task({ dueAt: "2026-06-30T13:00:00.000Z" }), now)).toBe("upcoming");
    expect(getTaskDueBucket(task({ dueAt: null }), now)).toBe("none");
    expect(getTaskDueBucket(task({ dueAt: "not-a-date" }), now)).toBe("none");
    expect(
      getTaskDueBucket(
        task({
          dueAt: "2026-06-26T23:59:00.000Z",
          completedAt: "2026-06-27T09:00:00.000Z",
        }),
        now,
      ),
    ).toBe("done");
  });

  test("sorts open urgent overdue tasks before completed and undated tasks", () => {
    const rows = [
      task({ id: "done", completedAt: "2026-06-27T09:00:00.000Z" }),
      task({ id: "none", dueAt: null }),
      task({ id: "urgent", priority: "urgent", dueAt: "2026-06-26T08:00:00.000Z" }),
      task({ id: "normal", priority: "normal", dueAt: "2026-06-26T08:00:00.000Z" }),
    ];

    expect(
      sortCoordinatorTasks(rows, new Date("2026-06-27T10:00:00.000Z")).map((row) => row.id),
    ).toEqual(["urgent", "normal", "none", "done"]);
  });

  test("sorts overdue work before scheduled, undated, and completed tasks", () => {
    const rows = [
      task({
        id: "done",
        completedAt: "2026-06-27T09:00:00.000Z",
        priority: "urgent",
        dueAt: "2026-06-26T08:00:00.000Z",
      }),
      task({
        id: "invalid",
        priority: "urgent",
        dueAt: "definitely-not-a-date",
        createdAt: "2026-06-27T08:04:00.000Z",
      }),
      task({
        id: "none",
        priority: "urgent",
        dueAt: null,
        createdAt: "2026-06-27T08:03:00.000Z",
      }),
      task({ id: "upcoming-urgent", priority: "urgent", dueAt: "2026-06-28T09:00:00.000Z" }),
      task({ id: "today-normal", priority: "normal", dueAt: "2026-06-27T13:00:00.000Z" }),
      task({ id: "overdue-low", priority: "low", dueAt: "2026-06-26T08:00:00.000Z" }),
      task({ id: "overdue-urgent", priority: "urgent", dueAt: "2026-06-27T09:00:00.000Z" }),
    ];

    expect(
      sortCoordinatorTasks(rows, new Date("2026-06-27T10:00:00.000Z")).map((row) => row.id),
    ).toEqual([
      "overdue-low",
      "overdue-urgent",
      "upcoming-urgent",
      "today-normal",
      "invalid",
      "none",
      "done",
    ]);
  });

  test("requires useful completion detail for completed and cancelled statuses", () => {
    const completed = status({ key: "completed", isFinal: true, isClosing: true });
    const cancelled = status({ key: "cancelled", isFinal: true, isClosing: true });

    expect(isTaskFinalStatus(completed)).toBe(true);
    expect(() =>
      validateTaskCompletion({
        status: completed,
        completedAt: null,
        outcome: "Done",
        remarks: null,
      }),
    ).toThrow("Completed tasks require a completed date");
    expect(() =>
      validateTaskCompletion({
        status: completed,
        completedAt: "2026-06-27T10:00:00.000Z",
        outcome: null,
        remarks: null,
      }),
    ).toThrow("Completed tasks require an outcome or remarks");
    expect(() =>
      validateTaskCompletion({
        status: cancelled,
        completedAt: null,
        outcome: null,
        remarks: null,
      }),
    ).toThrow("Cancelled tasks require an outcome or remarks");
  });

  test("chooses audit action from status and mutation shape", () => {
    expect(buildTaskAuditAction({ created: true, status: status() })).toBe(
      "coordinator_task.create",
    );
    expect(
      buildTaskAuditAction({ created: false, status: status({ key: "completed", isFinal: true }) }),
    ).toBe("coordinator_task.complete");
    expect(
      buildTaskAuditAction({ created: false, status: status({ key: "cancelled", isFinal: true }) }),
    ).toBe("coordinator_task.cancel");
    expect(buildTaskAuditAction({ created: false, status: status() })).toBe(
      "coordinator_task.update",
    );
  });
});
