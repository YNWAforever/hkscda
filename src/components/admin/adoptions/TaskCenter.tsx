import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  CoordinatorStatus,
  CoordinatorTask,
  CoordinatorTaskPriority,
} from "../../../lib/adoptions/types";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { fetchCoordinatorJson } from "./api";
import { TaskPanel, TaskPanelAsyncError } from "./TaskPanel";
import {
  TASK_CENTER_DUE_FILTER_OPTIONS,
  buildTaskCenterSummary,
  buildTaskListSearchParams,
  TASK_CENTER_PAGE_SIZE,
  type TaskCenterDueFilter,
  type TaskCenterPriorityFilter,
} from "./taskCenterLogic";

type TaskListResponse = {
  tasks: CoordinatorTask[];
  total: number;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

const PRIORITY_OPTIONS: Array<{ value: TaskCenterPriorityFilter; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const EMPTY_TASKS: CoordinatorTask[] = [];

const SUMMARY_ITEMS = [
  { label: "Overdue", value: "overdue" },
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "No due date", value: "none" },
  { label: "Done", value: "done" },
  { label: "Urgent", value: "urgent" },
] as const;

function TaskCenterLoadError({ message }: { message: string }) {
  return <TaskPanelAsyncError message={`Could not load coordinator tasks: ${message}`} />;
}

export function TaskCenter() {
  const [q, setQ] = useState("");
  const [due, setDue] = useState<TaskCenterDueFilter>("all");
  const [priority, setPriority] = useState<TaskCenterPriorityFilter>("all");
  const [assignedTo, setAssignedTo] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);

  const searchParams = useMemo(
    () =>
      buildTaskListSearchParams({
        q,
        due,
        priority,
        assignedTo,
        openOnly,
        page,
      }),
    [assignedTo, due, openOnly, page, priority, q],
  );

  const statusesQuery = useQuery<StatusesResponse, Error>({
    queryKey: ["coordinator-statuses"],
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const tasksQuery = useQuery<TaskListResponse, Error>({
    queryKey: ["coordinator-tasks", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<TaskListResponse>(`/api/admin/adoptions/tasks?${searchParams}`),
  });

  const statuses = statusesQuery.data?.statuses ?? [];
  const tasks = tasksQuery.data?.tasks ?? EMPTY_TASKS;
  const total = tasksQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TASK_CENTER_PAGE_SIZE));
  const summary = useMemo(() => buildTaskCenterSummary(tasks), [tasks]);
  const isFetching = statusesQuery.isFetching || tasksQuery.isFetching;

  function resetToFirstPage() {
    setPage(1);
  }

  function handlePriorityChange(value: string) {
    setPriority(value as CoordinatorTaskPriority | "all");
    resetToFirstPage();
  }

  function handleDueChange(value: string) {
    setDue(value as TaskCenterDueFilter);
    resetToFirstPage();
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Coordinator task center</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            View, filter, and update follow-up work across adoption cases and animals.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => tasksQuery.refetch()}
          disabled={isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 xl:grid-cols-[minmax(260px,1fr)_180px_180px_220px_170px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                resetToFirstPage();
              }}
              aria-label="Search tasks"
              className="h-9 pl-9"
              placeholder="Search title, outcome, or remarks"
            />
          </label>

          <Select value={due} onValueChange={handleDueChange}>
            <SelectTrigger aria-label="Filter by due date" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_CENTER_DUE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={handlePriorityChange}>
            <SelectTrigger aria-label="Filter by priority" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value || "empty"} value={option.value || "all"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={assignedTo}
            onChange={(event) => {
              setAssignedTo(event.target.value);
              resetToFirstPage();
            }}
            aria-label="Filter by assignee"
            className="h-9"
            placeholder="Assigned to"
          />

          <label className="flex h-9 items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
            <span>Open only</span>
            <Switch
              checked={openOnly}
              onCheckedChange={(checked) => {
                setOpenOnly(checked);
                resetToFirstPage();
              }}
              aria-label="Show open tasks only"
            />
          </label>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQ("");
              setDue("all");
              setPriority("all");
              setAssignedTo("");
              setOpenOnly(true);
              setPage(1);
            }}
            disabled={isFetching}
          >
            Clear
          </Button>
        </div>
        {statusesQuery.error && (
          <TaskPanelAsyncError
            message={`Could not load task statuses: ${statusesQuery.error.message}`}
          />
        )}
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
        aria-label="Current page task summary"
      >
        {SUMMARY_ITEMS.map((item) => (
          <div
            key={item.value}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <div className="text-xs font-medium text-[var(--color-text-muted)]">{item.label}</div>
            <div className="text-2xl font-bold text-[var(--color-panel)]">
              {summary[item.value]}
            </div>
          </div>
        ))}
      </section>

      <section>
        {tasksQuery.error && <TaskCenterLoadError message={tasksQuery.error.message} />}
        <TaskPanel
          title="Tasks"
          subtitle={tasksQuery.isLoading ? "Loading..." : `${total} total`}
          tasks={tasks}
          statuses={statuses}
          showCreateForm={false}
          emptyMessage="No coordinator tasks match these filters"
          onChanged={async () => {
            await tasksQuery.refetch();
          }}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
