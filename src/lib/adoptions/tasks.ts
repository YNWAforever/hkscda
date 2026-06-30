import type { CoordinatorStatus, CoordinatorTask, CoordinatorTaskPriority } from "./types";

export type TaskDueBucket = "overdue" | "today" | "upcoming" | "none" | "done";

const PRIORITY_WEIGHT: Record<CoordinatorTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const hongKongOffsetMs = 8 * 60 * 60 * 1000;

export function hongKongDayBounds(now: Date) {
  const hongKongDate = new Date(now.getTime() + hongKongOffsetMs);
  const start =
    Date.UTC(hongKongDate.getUTCFullYear(), hongKongDate.getUTCMonth(), hongKongDate.getUTCDate()) -
    hongKongOffsetMs;
  const end = start + 24 * 60 * 60 * 1000;

  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

function parseTaskDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function taskDueTime(value: string | null | undefined) {
  return parseTaskDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function isTaskFinalStatus(status: CoordinatorStatus) {
  return status.category === "followup" && (status.isFinal || status.isClosing);
}

export function getTaskDueBucket(
  task: Pick<CoordinatorTask, "dueAt" | "completedAt">,
  now: Date,
): TaskDueBucket {
  if (task.completedAt) return "done";
  if (!task.dueAt) return "none";

  const due = parseTaskDate(task.dueAt);
  if (!due) return "none";

  if (due.getTime() < now.getTime()) return "overdue";
  if (due.getTime() < new Date(hongKongDayBounds(now).end).getTime()) return "today";
  return "upcoming";
}

export function sortCoordinatorTasks(tasks: CoordinatorTask[], now: Date) {
  return [...tasks].sort((left, right) => {
    const leftGroup = taskSortGroup(left, now);
    const rightGroup = taskSortGroup(right, now);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;

    const leftPriority = PRIORITY_WEIGHT[left.priority];
    const rightPriority = PRIORITY_WEIGHT[right.priority];
    const leftDue = taskDueTime(left.dueAt);
    const rightDue = taskDueTime(right.dueAt);

    if (leftGroup === 0) {
      if (leftDue !== rightDue) return leftDue - rightDue;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    } else if (leftGroup === 1) {
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (leftDue !== rightDue) return leftDue - rightDue;
    } else if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function taskSortGroup(task: CoordinatorTask, now: Date) {
  if (task.completedAt) return 4;

  const due = parseTaskDate(task.dueAt);
  if (!due) return 3;
  if (due.getTime() < now.getTime()) return 0;
  return 1;
}

export function validateTaskCompletion(input: {
  status: CoordinatorStatus;
  completedAt: string | null | undefined;
  outcome: string | null | undefined;
  remarks: string | null | undefined;
}) {
  if (
    input.status.key === "completed" ||
    (isTaskFinalStatus(input.status) && input.status.key !== "cancelled")
  ) {
    if (!input.completedAt) throw new Error("Completed tasks require a completed date");
    if (!input.outcome?.trim() && !input.remarks?.trim()) {
      throw new Error("Completed tasks require an outcome or remarks");
    }
  }

  if (input.status.key === "cancelled" && !input.outcome?.trim() && !input.remarks?.trim()) {
    throw new Error("Cancelled tasks require an outcome or remarks");
  }
}

export function buildTaskAuditAction(input: { created: boolean; status: CoordinatorStatus }) {
  if (input.created) return "coordinator_task.create";
  if (input.status.key === "completed") return "coordinator_task.complete";
  if (input.status.key === "cancelled") return "coordinator_task.cancel";
  return "coordinator_task.update";
}
