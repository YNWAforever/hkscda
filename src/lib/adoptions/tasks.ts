import type { CoordinatorStatus, CoordinatorTask, CoordinatorTaskPriority } from "./types";

export type TaskDueBucket = "overdue" | "today" | "upcoming" | "none" | "done";

const PRIORITY_WEIGHT: Record<CoordinatorTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
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

  const due = new Date(task.dueAt);
  const dueDay = startOfDay(due);
  const today = startOfDay(now);
  if (due.getTime() < now.getTime() && dueDay < today) return "overdue";
  if (dueDay === today) return "today";
  return "upcoming";
}

export function sortCoordinatorTasks(tasks: CoordinatorTask[], now: Date) {
  return [...tasks].sort((left, right) => {
    const leftDone = left.completedAt ? 1 : 0;
    const rightDone = right.completedAt ? 1 : 0;
    if (leftDone !== rightDone) return leftDone - rightDone;

    const leftPriority = PRIORITY_WEIGHT[left.priority];
    const rightPriority = PRIORITY_WEIGHT[right.priority];
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
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
