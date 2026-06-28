import type {
  CoordinatorStatus,
  CoordinatorTaskContactChannel,
  CoordinatorTaskPriority,
} from "../../../lib/adoptions/types";
import { filterStatusesByCategory } from "./caseWorkflowLogic";

export type CreateTaskFormState = {
  defaultLinks: TaskPanelDefaultLinks;
  statusId: string;
  title: string;
  priority: CoordinatorTaskPriority;
  dueAt: string;
  scheduledAt: string;
  volunteer: string;
  contactChannel: CoordinatorTaskContactChannel | "";
  remarks: string;
};

export type TaskPanelDefaultLinks = {
  adoptionCaseId?: string;
  adopterProfileId?: string;
  animalId?: string;
};

export type UpdateTaskFormState = {
  statusId: string;
  priority: CoordinatorTaskPriority;
  dueAt: string;
  scheduledAt: string;
  completedAt: string;
  volunteer: string;
  contactChannel: CoordinatorTaskContactChannel | "";
  outcome: string;
  nextStepAt: string;
  remarks: string;
};

export type CreateTaskPayload = {
  adoptionCaseId?: string;
  adopterProfileId?: string;
  animalId?: string;
  statusId: string;
  title: string;
  taskType: "followup";
  priority: CoordinatorTaskPriority;
  dueAt?: string;
  scheduledAt?: string;
  volunteer?: string;
  contactChannel?: CoordinatorTaskContactChannel;
  remarks?: string;
};

export type UpdateTaskPayload = {
  statusId?: string;
  priority?: CoordinatorTaskPriority;
  dueAt?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  volunteer?: string | null;
  contactChannel?: CoordinatorTaskContactChannel | null;
  outcome?: string | null;
  nextStepAt?: string | null;
  remarks?: string | null;
};

function trimmed(value: string | null | undefined) {
  return value?.trim() ?? "";
}

const taskDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function sortedStatuses(statuses: CoordinatorStatus[]) {
  return [...statuses].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.labelZh.localeCompare(right.labelZh),
  );
}

export function getDefaultFollowupStatusId(statuses: CoordinatorStatus[]) {
  const followupStatuses = filterStatusesByCategory(statuses, "followup");
  return (
    followupStatuses.find((status) => status.key === "scheduled")?.id ??
    followupStatuses.find((status) => status.key === "pending")?.id ??
    followupStatuses[0]?.id ??
    ""
  );
}

export function statusesForTaskControl(
  statuses: CoordinatorStatus[],
  currentStatus?: CoordinatorStatus | null,
) {
  const activeStatuses = filterStatusesByCategory(statuses, "followup");
  if (!currentStatus || activeStatuses.some((status) => status.id === currentStatus.id)) {
    return activeStatuses;
  }

  return sortedStatuses([...activeStatuses, currentStatus]);
}

export function isoToDatetimeLocal(value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (!nextValue) return "";

  const date = new Date(nextValue);
  if (!Number.isFinite(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function datetimeLocalToIso(value: string | null | undefined, emptyMode: "omit" | "null") {
  const nextValue = trimmed(value);
  if (!nextValue) return emptyMode === "null" ? null : undefined;

  const date = new Date(nextValue);
  if (!Number.isFinite(date.getTime())) return emptyMode === "null" ? null : undefined;

  return date.toISOString();
}

export function formatTaskDateTime(value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (!nextValue) return "-";

  const date = new Date(nextValue);
  if (!Number.isFinite(date.getTime())) return "-";

  const parts = Object.fromEntries(
    taskDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function optionalString(value: string) {
  return trimmed(value) || undefined;
}

function nullableString(value: string) {
  return trimmed(value) || null;
}

export function buildCreateTaskPayload(form: CreateTaskFormState): CreateTaskPayload | null {
  const adoptionCaseId = trimmed(form.defaultLinks.adoptionCaseId);
  const adopterProfileId = trimmed(form.defaultLinks.adopterProfileId);
  const animalId = trimmed(form.defaultLinks.animalId);
  const statusId = trimmed(form.statusId);
  const title = trimmed(form.title);

  if ((!adoptionCaseId && !adopterProfileId && !animalId) || !statusId || !title) return null;

  const payload: CreateTaskPayload = {
    statusId,
    title,
    taskType: "followup",
    priority: form.priority,
  };
  const dueAt = datetimeLocalToIso(form.dueAt, "omit");
  const scheduledAt = datetimeLocalToIso(form.scheduledAt, "omit");
  const volunteer = optionalString(form.volunteer);
  const remarks = optionalString(form.remarks);

  if (adoptionCaseId) payload.adoptionCaseId = adoptionCaseId;
  if (adopterProfileId) payload.adopterProfileId = adopterProfileId;
  if (animalId) payload.animalId = animalId;
  if (dueAt) payload.dueAt = dueAt;
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (volunteer) payload.volunteer = volunteer;
  if (form.contactChannel) payload.contactChannel = form.contactChannel;
  if (remarks) payload.remarks = remarks;

  return payload;
}

export function buildUpdateTaskPayload(
  form: UpdateTaskFormState,
  originalStatusId?: string | null,
): UpdateTaskPayload {
  const statusId = trimmed(form.statusId);
  const currentStatusId = trimmed(originalStatusId);
  const payload: UpdateTaskPayload = {
    priority: form.priority,
    dueAt: datetimeLocalToIso(form.dueAt, "null"),
    scheduledAt: datetimeLocalToIso(form.scheduledAt, "null"),
    completedAt: datetimeLocalToIso(form.completedAt, "null"),
    volunteer: nullableString(form.volunteer),
    contactChannel: form.contactChannel || null,
    outcome: nullableString(form.outcome),
    nextStepAt: datetimeLocalToIso(form.nextStepAt, "null"),
    remarks: nullableString(form.remarks),
  };

  if (statusId && statusId !== currentStatusId) payload.statusId = statusId;
  return payload;
}
