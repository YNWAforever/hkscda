import { describe, expect, test } from "bun:test";

import type { CoordinatorTask } from "../../../lib/adoptions/types";
import { buildTaskCenterSummary, buildTaskListSearchParams } from "./taskCenterLogic";

function task(overrides: Partial<CoordinatorTask> = {}): CoordinatorTask {
  return {
    id: "task-1",
    title: "Follow up",
    status: {
      id: "status-1",
      category: "followup",
      key: "pending",
      labelZh: "待辦",
      labelEn: "Pending",
      sortOrder: 1,
      color: "coral",
      isActive: true,
      isSystem: false,
      isClosing: false,
      isFinal: false,
    },
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
    createdAt: "2026-06-26T10:00:00.000Z",
    updatedAt: "2026-06-26T10:00:00.000Z",
    adoptionCase: null,
    adopterProfile: null,
    animal: null,
    ...overrides,
  };
}

describe("task center logic", () => {
  test("builds trimmed task list search params and omits all filters", () => {
    const params = buildTaskListSearchParams({
      q: "  window net  ",
      due: "all",
      priority: "all",
      assignedTo: "  Ada  ",
      openOnly: true,
      page: 0,
    });

    expect(params.toString()).toBe("q=window+net&assignedTo=Ada&openOnly=true&page=1&pageSize=25");
  });

  test("includes due and priority filters when specific values are selected", () => {
    const params = buildTaskListSearchParams({
      q: "",
      due: "overdue",
      priority: "urgent",
      assignedTo: "",
      openOnly: false,
      page: 3,
    });

    expect(params.toString()).toBe("due=overdue&priority=urgent&page=3&pageSize=25");
  });

  test("summarizes the current page by due bucket and urgent priority", () => {
    const summary = buildTaskCenterSummary(
      [
        task({ id: "overdue", dueAt: "2026-06-27T00:30:00.000Z" }),
        task({ id: "today", dueAt: "2026-06-27T09:00:00.000Z", priority: "urgent" }),
        task({ id: "upcoming", dueAt: "2026-06-28T06:00:00.000Z" }),
        task({ id: "none", dueAt: null, priority: "urgent" }),
        task({
          id: "done",
          dueAt: "2026-06-27T09:00:00.000Z",
          completedAt: "2026-06-27T09:30:00.000Z",
        }),
      ],
      new Date("2026-06-27T01:00:00.000Z"),
    );

    expect(summary).toEqual({
      overdue: 1,
      today: 1,
      upcoming: 1,
      none: 1,
      done: 1,
      urgent: 2,
    });
  });
});
