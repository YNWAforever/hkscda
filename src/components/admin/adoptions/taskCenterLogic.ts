import { getTaskDueBucket, type TaskDueBucket } from "../../../lib/adoptions/tasks";
import type { CoordinatorTask, CoordinatorTaskPriority } from "../../../lib/adoptions/types";

export type TaskCenterDueFilter = Exclude<TaskDueBucket, "done"> | "all";
export type TaskCenterPriorityFilter = CoordinatorTaskPriority | "all" | "";

export type TaskCenterFilters = {
  q: string;
  due: TaskCenterDueFilter;
  priority: TaskCenterPriorityFilter;
  assignedTo: string;
  openOnly: boolean;
  page: number;
};

export type TaskCenterSummary = Record<TaskDueBucket, number> & {
  urgent: number;
};

export const TASK_CENTER_PAGE_SIZE = 25;
export const TASK_CENTER_DUE_FILTER_OPTIONS: Array<{ value: TaskCenterDueFilter; label: string }> =
  [
    { value: "all", label: "All due dates" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Due today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "none", label: "No due date" },
  ];

function addTrimmed(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) params.set(key, trimmed);
}

export function buildTaskListSearchParams(filters: TaskCenterFilters) {
  const params = new URLSearchParams();

  addTrimmed(params, "q", filters.q);
  if (filters.due !== "all") params.set("due", filters.due);
  if (filters.priority && filters.priority !== "all") params.set("priority", filters.priority);
  addTrimmed(params, "assignedTo", filters.assignedTo);
  if (filters.openOnly) params.set("openOnly", "true");
  params.set("page", String(Math.max(1, filters.page || 1)));
  params.set("pageSize", String(TASK_CENTER_PAGE_SIZE));

  return params;
}

export function buildTaskCenterSummary(
  tasks: CoordinatorTask[],
  now = new Date(),
): TaskCenterSummary {
  const summary: TaskCenterSummary = {
    overdue: 0,
    today: 0,
    upcoming: 0,
    none: 0,
    done: 0,
    urgent: 0,
  };

  for (const task of tasks) {
    summary[getTaskDueBucket(task, now)] += 1;
    if (task.priority === "urgent") summary.urgent += 1;
  }

  return summary;
}
