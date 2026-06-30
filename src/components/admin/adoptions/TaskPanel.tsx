import { useMutation } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  CoordinatorStatus,
  CoordinatorTask,
  CoordinatorTaskContactChannel,
  CoordinatorTaskPriority,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { bilingualStatusName, statusDisplayName, useAdminPageCopy } from "../adminPageCopy";
import { fetchCoordinatorJson } from "./api";
import { formatFallback } from "./caseWorkflowLogic";
import {
  buildCreateTaskPayload,
  buildUpdateTaskPayload,
  formatTaskDateTime,
  getDefaultFollowupStatusId,
  isoToDatetimeLocal,
  statusesForTaskControl,
} from "./taskPanelLogic";
import type {
  CreateTaskFormState,
  TaskPanelDefaultLinks,
  UpdateTaskFormState,
} from "./taskPanelLogic";

type TaskPanelProps = {
  title?: string;
  subtitle?: string;
  tasks: CoordinatorTask[];
  statuses: CoordinatorStatus[];
  defaultLinks?: TaskPanelDefaultLinks;
  showCreateForm?: boolean;
  emptyMessage?: string;
  onChanged?: () => Promise<void> | void;
};

type MutateTaskResponse = {
  task: {
    id: string;
  };
};

const PRIORITIES: CoordinatorTaskPriority[] = ["low", "normal", "high", "urgent"];

const CONTACT_CHANNELS: CoordinatorTaskContactChannel[] = [
  "phone",
  "whatsapp",
  "email",
  "in_person",
  "internal",
];

const EMPTY_DEFAULT_LINKS: TaskPanelDefaultLinks = {};

const STATUS_DOT_CLASSES: Record<string, string> = {
  amber: "bg-[var(--color-warning)]",
  blue: "bg-[var(--color-panel)]",
  coral: "bg-[var(--color-primary)]",
  cyan: "bg-[var(--color-lavender-deep)]",
  green: "bg-[var(--color-success)]",
  indigo: "bg-[var(--color-panel-2)]",
  purple: "bg-[var(--color-secondary)]",
  red: "bg-[var(--color-error)]",
  slate: "bg-[var(--color-text-muted)]",
};

function emptyCreateForm(
  defaultLinks: TaskPanelDefaultLinks = {},
  statusId = "",
): CreateTaskFormState {
  return {
    defaultLinks,
    statusId,
    title: "",
    priority: "normal",
    dueAt: "",
    scheduledAt: "",
    volunteer: "",
    contactChannel: "",
    remarks: "",
  };
}

function updateFormFromTask(task: CoordinatorTask): UpdateTaskFormState {
  return {
    statusId: task.status.id,
    priority: task.priority,
    dueAt: isoToDatetimeLocal(task.dueAt),
    scheduledAt: isoToDatetimeLocal(task.scheduledAt),
    completedAt: isoToDatetimeLocal(task.completedAt),
    volunteer: task.volunteer ?? "",
    contactChannel: task.contactChannel ?? "",
    outcome: task.outcome ?? "",
    nextStepAt: isoToDatetimeLocal(task.nextStepAt),
    remarks: task.remarks ?? "",
  };
}

function StatusChip({ status }: { status: CoordinatorStatus }) {
  const { language } = useAdminPageCopy();

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      <span
        className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status.color] ?? "bg-[var(--color-border)]"}`}
        aria-hidden="true"
      />
      <span>{statusDisplayName(status, language)}</span>
    </Badge>
  );
}

function priorityLabel(
  priority: CoordinatorTaskPriority,
  copy: ReturnType<typeof useAdminPageCopy>["pageCopy"],
) {
  return copy.priority[priority] ?? priority;
}

function contactChannelLabel(
  channel: CoordinatorTaskContactChannel | null,
  copy: ReturnType<typeof useAdminPageCopy>["pageCopy"],
) {
  if (!channel) return "-";
  return copy.contactChannel[channel] ?? channel;
}

export function TaskPanelAsyncError({ message }: { message: string }) {
  return (
    <div
      className="border-b border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      {message}
    </div>
  );
}

function StatusSelect({
  id,
  value,
  statuses,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  statuses: CoordinatorStatus[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { language, pageCopy } = useAdminPageCopy();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-9">
        <SelectValue placeholder={placeholder ?? pageCopy.taskPanel.chooseStatus} />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            {bilingualStatusName(status, language)}
            {!status.isActive ? ` (${pageCopy.common.inactive})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PrioritySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CoordinatorTaskPriority;
  onChange: (value: CoordinatorTaskPriority) => void;
}) {
  const { pageCopy } = useAdminPageCopy();

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as CoordinatorTaskPriority)}
    >
      <SelectTrigger id={id} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {pageCopy.priority[priority]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactChannelSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CoordinatorTaskContactChannel | "";
  onChange: (value: CoordinatorTaskContactChannel | "") => void;
}) {
  const { pageCopy } = useAdminPageCopy();

  return (
    <Select
      value={value || "none"}
      onValueChange={(nextValue) =>
        onChange(nextValue === "none" ? "" : (nextValue as CoordinatorTaskContactChannel))
      }
    >
      <SelectTrigger id={id} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{pageCopy.common.noChannel}</SelectItem>
        {CONTACT_CHANNELS.map((channel) => (
          <SelectItem key={channel} value={channel}>
            {pageCopy.contactChannel[channel]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaskItem({
  task,
  statuses,
  onChanged,
}: {
  task: CoordinatorTask;
  statuses: CoordinatorStatus[];
  onChanged?: () => Promise<void> | void;
}) {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.taskPanel;
  const [form, setForm] = useState<UpdateTaskFormState>(() => updateFormFromTask(task));

  useEffect(() => {
    setForm(updateFormFromTask(task));
  }, [task]);

  const taskStatuses = useMemo(
    () => statusesForTaskControl(statuses, task.status),
    [statuses, task.status],
  );

  const updateMutation = useMutation<MutateTaskResponse, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<MutateTaskResponse>(
        `/api/admin/adoptions/tasks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildUpdateTaskPayload(form, task.status.id)),
        },
      ),
    onSuccess: async () => {
      await onChanged?.();
    },
  });

  return (
    <article className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(220px,1.1fr)_minmax(360px,2fr)]">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">{task.title}</h3>
              <StatusChip status={task.status} />
              <Badge
                variant="outline"
                className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
              >
                {priorityLabel(task.priority, pageCopy)}
              </Badge>
            </div>
            <div className="grid gap-2 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
              <span>
                {copy.display.due}: {formatTaskDateTime(task.dueAt)}
              </span>
              <span>
                {copy.display.scheduled}: {formatTaskDateTime(task.scheduledAt)}
              </span>
              <span>
                {copy.display.completed}: {formatTaskDateTime(task.completedAt)}
              </span>
              <span>
                {copy.display.nextStep}: {formatTaskDateTime(task.nextStepAt)}
              </span>
              <span>
                {copy.display.volunteer}: {formatFallback(task.volunteer ?? task.assignedTo)}
              </span>
              <span>
                {copy.display.channel}: {contactChannelLabel(task.contactChannel, pageCopy)}
              </span>
            </div>
          </div>
          {(task.outcome || task.remarks) && (
            <div className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
              <div className="text-[var(--color-panel)]">
                {copy.display.outcome}: {formatFallback(task.outcome)}
              </div>
              <div className="whitespace-pre-wrap text-[var(--color-text-muted)]">
                {copy.display.remarks}: {formatFallback(task.remarks)}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`task-status-${task.id}`}>{copy.labels.status}</Label>
            <StatusSelect
              id={`task-status-${task.id}`}
              value={form.statusId}
              statuses={taskStatuses}
              onChange={(value) => setForm((current) => ({ ...current, statusId: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-priority-${task.id}`}>{copy.labels.priority}</Label>
            <PrioritySelect
              id={`task-priority-${task.id}`}
              value={form.priority}
              onChange={(value) => setForm((current) => ({ ...current, priority: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-channel-${task.id}`}>{copy.labels.channel}</Label>
            <ContactChannelSelect
              id={`task-channel-${task.id}`}
              value={form.contactChannel}
              onChange={(value) => setForm((current) => ({ ...current, contactChannel: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-due-${task.id}`}>{copy.labels.due}</Label>
            <Input
              id={`task-due-${task.id}`}
              type="datetime-local"
              value={form.dueAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, dueAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-scheduled-${task.id}`}>{copy.labels.scheduled}</Label>
            <Input
              id={`task-scheduled-${task.id}`}
              type="datetime-local"
              value={form.scheduledAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, scheduledAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-completed-${task.id}`}>{copy.labels.completed}</Label>
            <Input
              id={`task-completed-${task.id}`}
              type="datetime-local"
              value={form.completedAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, completedAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-next-${task.id}`}>{copy.labels.nextStep}</Label>
            <Input
              id={`task-next-${task.id}`}
              type="datetime-local"
              value={form.nextStepAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, nextStepAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`task-volunteer-${task.id}`}>{copy.labels.volunteer}</Label>
            <Input
              id={`task-volunteer-${task.id}`}
              value={form.volunteer}
              onChange={(event) =>
                setForm((current) => ({ ...current, volunteer: event.target.value }))
              }
              placeholder={copy.placeholders.optional}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
            <Label htmlFor={`task-outcome-${task.id}`}>{copy.labels.outcome}</Label>
            <Input
              id={`task-outcome-${task.id}`}
              value={form.outcome}
              onChange={(event) =>
                setForm((current) => ({ ...current, outcome: event.target.value }))
              }
              placeholder={copy.placeholders.optional}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`task-remarks-${task.id}`}>{copy.labels.remarks}</Label>
            <Textarea
              id={`task-remarks-${task.id}`}
              value={form.remarks}
              onChange={(event) =>
                setForm((current) => ({ ...current, remarks: event.target.value }))
              }
              className="min-h-9"
              placeholder={copy.placeholders.remarks}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={!form.statusId || updateMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {copy.saveTask}
            </Button>
          </div>
          {updateMutation.error && (
            <p
              className="text-sm text-[var(--color-error)] md:col-span-2 xl:col-span-3"
              role="alert"
            >
              {updateMutation.error.message}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function TaskPanel({
  title,
  subtitle,
  tasks,
  statuses,
  defaultLinks = EMPTY_DEFAULT_LINKS,
  showCreateForm = true,
  emptyMessage,
  onChanged,
}: TaskPanelProps) {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.taskPanel;
  const defaultStatusId = useMemo(() => getDefaultFollowupStatusId(statuses), [statuses]);
  const followupStatuses = useMemo(() => statusesForTaskControl(statuses), [statuses]);
  const defaultLinksForForm = useMemo(
    () => ({
      adoptionCaseId: defaultLinks.adoptionCaseId,
      adopterProfileId: defaultLinks.adopterProfileId,
      animalId: defaultLinks.animalId,
    }),
    [defaultLinks.adoptionCaseId, defaultLinks.adopterProfileId, defaultLinks.animalId],
  );
  const [form, setForm] = useState<CreateTaskFormState>(() =>
    emptyCreateForm(defaultLinksForForm, defaultStatusId),
  );

  useEffect(() => {
    setForm((current) => ({
      ...current,
      defaultLinks: defaultLinksForForm,
      statusId: current.statusId || defaultStatusId,
    }));
  }, [defaultLinksForForm, defaultStatusId]);

  const createPayload = useMemo(() => buildCreateTaskPayload(form), [form]);
  const createMutation = useMutation<MutateTaskResponse, Error, void>({
    mutationFn: () => {
      const payload = buildCreateTaskPayload(form);
      if (!payload) throw new Error(copy.createValidation);

      return fetchCoordinatorJson<MutateTaskResponse>("/api/admin/adoptions/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setForm(emptyCreateForm(defaultLinksForForm, defaultStatusId));
      await onChanged?.();
    },
  });

  const canCreate = Boolean(createPayload) && !createMutation.isPending;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-panel)]">
            {title ?? copy.defaultTitle}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {subtitle ?? pageCopy.common.scheduledOrCompleted(tasks.length)}
          </p>
        </div>
      </div>

      {showCreateForm && (
        <div className="grid gap-4 border-b border-[var(--color-border)] p-4 lg:grid-cols-[minmax(220px,1fr)_200px_180px_180px_minmax(220px,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">{copy.labels.title}</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder={copy.placeholders.title}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-status">{copy.labels.status}</Label>
            <StatusSelect
              id="task-status"
              value={form.statusId}
              statuses={followupStatuses}
              onChange={(value) => setForm((current) => ({ ...current, statusId: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">{copy.labels.priority}</Label>
            <PrioritySelect
              id="task-priority"
              value={form.priority}
              onChange={(value) => setForm((current) => ({ ...current, priority: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-create-channel">{copy.labels.channel}</Label>
            <ContactChannelSelect
              id="task-create-channel"
              value={form.contactChannel}
              onChange={(value) => setForm((current) => ({ ...current, contactChannel: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-volunteer">{copy.labels.volunteer}</Label>
            <Input
              id="task-volunteer"
              value={form.volunteer}
              onChange={(event) =>
                setForm((current) => ({ ...current, volunteer: event.target.value }))
              }
              placeholder={copy.placeholders.optional}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => createMutation.mutate()} disabled={!canCreate}>
              <Plus className="h-4 w-4" />
              {copy.addTask}
            </Button>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="task-due">{copy.labels.due}</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={form.dueAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, dueAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="task-scheduled">{copy.labels.scheduled}</Label>
            <Input
              id="task-scheduled"
              type="datetime-local"
              value={form.scheduledAt}
              className="h-11"
              onChange={(event) =>
                setForm((current) => ({ ...current, scheduledAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="task-remarks">{copy.labels.remarks}</Label>
            <Textarea
              id="task-remarks"
              value={form.remarks}
              onChange={(event) =>
                setForm((current) => ({ ...current, remarks: event.target.value }))
              }
              className="min-h-9"
              placeholder={copy.placeholders.remarks}
            />
          </div>
        </div>
      )}

      {showCreateForm && createMutation.error && (
        <TaskPanelAsyncError message={createMutation.error.message} />
      )}
      {showCreateForm && followupStatuses.length === 0 && (
        <TaskPanelAsyncError message={copy.addStatusFirst} />
      )}

      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-sm text-[var(--color-text-muted)]">
          {emptyMessage ?? copy.noFollowups}
        </div>
      ) : (
        <div>
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} statuses={statuses} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}
