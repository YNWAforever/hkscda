# Coordinator Phase C Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Coordinator Phase C as a unified task/follow-up system that links coordinator work to adoption cases, adopter profiles, animals, or any combination of those entities.

**Architecture:** Extend the existing `adoption_followup` table and app code into a `CoordinatorTask` domain while keeping the case follow-up route as a compatibility wrapper. Server routes remain staff/admin gated and return `no-store`; UI reuses a shared task panel from case detail, animal pipeline, and the new task center.

**Tech Stack:** TanStack Start file routes, React 19, TanStack Query, Supabase/Postgres/RLS, Bun tests, Tailwind v4, shadcn/ui.

---

## File Structure

- `supabase/migrations/20260627110000_coordinator_task_timeline.sql`: add task links, fields, constraints, and indexes to `adoption_followup`.
- `src/lib/supabaseMigrations.test.ts`: assert the migration includes link constraint, operational fields, and indexes.
- `src/lib/adoptions/types.ts`: add `CoordinatorTask`, linked summary types, task priority/channel types, and keep `AdoptionFollowup` compatibility if useful.
- `src/lib/adoptions/schemas.ts`: add task list/create/update schemas and keep `followupInputSchema` as a case-route wrapper.
- `src/lib/adoptions/tasks.ts`: pure task helpers for due buckets, sorting, completion validation, and audit action selection.
- `src/lib/adoptions/tasks.test.ts`: tests for pure task helpers.
- `src/lib/adoptions/service.ts`: add repository methods and service methods for list/create/get/update coordinator tasks.
- `src/lib/adoptions/service.test.ts`: tests for task validation, inactive status rejection, completion requirements, and audit behavior.
- `src/lib/adoptions/repository.server.ts`: map task rows, list/search tasks, create/update tasks, include task links in case detail.
- `src/lib/adoptions/repository.server.test.ts`: repository tests for row mapping and persistence payloads.
- `src/lib/adoptions/http.server.ts`: add handlers for task list/create/get/update and route wrapper behavior.
- `src/lib/adoptions/http.test.ts`: route tests for auth, `no-store`, filters, create/update, missing task, and compatibility route.
- `src/routes/api/admin/adoptions/tasks.ts`: list/create task API.
- `src/routes/api/admin/adoptions/tasks/$id.ts`: get/update task API.
- `src/routes/api/admin/adoptions/cases/$id/followups.ts`: continue using the shared task service through existing handler.
- `src/components/admin/adoptions/taskWorkflowLogic.ts`: frontend helpers for task query params, due labels, sorting/grouping, and payload building.
- `src/components/admin/adoptions/taskWorkflowLogic.test.ts`: component-logic tests for filters, overdue/due-today grouping, and payload normalization.
- `src/components/admin/adoptions/TaskPanel.tsx`: reusable panel for task list/create/edit actions.
- `src/components/admin/adoptions/CaseDetail.tsx`: replace read-only follow-up table with `TaskPanel`.
- `src/components/admin/adoptions/AnimalPipeline.tsx`: add selected animal task section using `TaskPanel`.
- `src/components/admin/adoptions/TaskCenter.tsx`: daily task queue page.
- `src/routes/admin/coordinator/tasks.tsx`: admin route for the task center.
- `src/components/admin/adminNav.ts`: add coordinator tasks navigation item.
- `src/components/admin/adminNav.test.ts`: assert the task center nav item activates by path.

---

## Task 1: Migration And Migration Safety Test

**Files:**
- Create: `supabase/migrations/20260627110000_coordinator_task_timeline.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the migration safety test**

Add this test to `src/lib/supabaseMigrations.test.ts`:

```ts
test("extends adoption followups into coordinator tasks", () => {
  const sql = readMigration("20260627110000_coordinator_task_timeline.sql");

  expect(sql).toContain("adopter_profile_id uuid");
  expect(sql).toContain("animal_id uuid");
  expect(sql).toContain("drop constraint if exists adoption_followup_adoption_case_id_not_null");
  expect(sql).toContain("adoption_followup_link_required");
  expect(sql).toContain("task_type text not null default 'followup'");
  expect(sql).toContain("priority text not null default 'normal'");
  expect(sql).toContain("contact_channel");
  expect(sql).toContain("adoption_followup_status_due_idx");
  expect(sql).toContain("adoption_followup_adopter_due_idx");
  expect(sql).toContain("adoption_followup_animal_due_idx");
  expect(sql).toContain("adoption_followup_overdue_idx");
});
```

- [ ] **Step 2: Run the focused migration test and verify it fails**

Run:

```bash
bun test src/lib/supabaseMigrations.test.ts
```

Expected: FAIL because `20260627110000_coordinator_task_timeline.sql` does not exist.

- [ ] **Step 3: Create the Supabase migration**

Run:

```bash
npx supabase migration new coordinator_task_timeline
```

If the generated timestamp differs, move the file so the final path is:

```text
supabase/migrations/20260627110000_coordinator_task_timeline.sql
```

Add this SQL:

```sql
alter table public.adoption_followup
  drop constraint if exists adoption_followup_adoption_case_id_not_null;

alter table public.adoption_followup
  alter column adoption_case_id drop not null,
  add column if not exists adopter_profile_id uuid references public.adopter_profile(id) on delete set null,
  add column if not exists animal_id uuid references public.animals(id) on delete set null,
  add column if not exists task_type text not null default 'followup',
  add column if not exists priority text not null default 'normal',
  add column if not exists due_at timestamptz,
  add column if not exists assigned_to text,
  add column if not exists contact_channel text,
  add column if not exists outcome text,
  add column if not exists next_step_at timestamptz;

alter table public.adoption_followup
  drop constraint if exists adoption_followup_link_required,
  add constraint adoption_followup_link_required
    check (
      adoption_case_id is not null
      or adopter_profile_id is not null
      or animal_id is not null
    );

alter table public.adoption_followup
  drop constraint if exists adoption_followup_priority_check,
  add constraint adoption_followup_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.adoption_followup
  drop constraint if exists adoption_followup_contact_channel_check,
  add constraint adoption_followup_contact_channel_check
    check (
      contact_channel is null
      or contact_channel in ('phone', 'whatsapp', 'email', 'in_person', 'internal')
    );

create index if not exists adoption_followup_status_due_idx
  on public.adoption_followup (status_id, due_at);

create index if not exists adoption_followup_case_due_idx
  on public.adoption_followup (adoption_case_id, due_at);

create index if not exists adoption_followup_adopter_due_idx
  on public.adoption_followup (adopter_profile_id, due_at);

create index if not exists adoption_followup_animal_due_idx
  on public.adoption_followup (animal_id, due_at);

create index if not exists adoption_followup_assigned_due_idx
  on public.adoption_followup (assigned_to, due_at);

create index if not exists adoption_followup_overdue_idx
  on public.adoption_followup (due_at)
  where completed_at is null;
```

- [ ] **Step 4: Run the focused migration test and verify it passes**

Run:

```bash
bun test src/lib/supabaseMigrations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabaseMigrations.test.ts supabase/migrations/20260627110000_coordinator_task_timeline.sql
git commit -m "feat: add coordinator task migration"
```

---

## Task 2: Task Schemas, Types, And Pure Helpers

**Files:**
- Modify: `src/lib/adoptions/types.ts`
- Modify: `src/lib/adoptions/schemas.ts`
- Create: `src/lib/adoptions/tasks.ts`
- Create: `src/lib/adoptions/tasks.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `src/lib/adoptions/tasks.test.ts`:

```ts
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
    expect(getTaskDueBucket(task({ dueAt: "2026-06-27T13:00:00.000Z" }), now)).toBe("today");
    expect(getTaskDueBucket(task({ dueAt: "2026-06-30T13:00:00.000Z" }), now)).toBe("upcoming");
    expect(getTaskDueBucket(task({ dueAt: null }), now)).toBe("none");
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

    expect(sortCoordinatorTasks(rows, new Date("2026-06-27T10:00:00.000Z")).map((row) => row.id)).toEqual([
      "urgent",
      "normal",
      "none",
      "done",
    ]);
  });

  test("requires useful completion detail for completed and cancelled statuses", () => {
    const completed = status({ key: "completed", isFinal: true, isClosing: true });
    const cancelled = status({ key: "cancelled", isFinal: true, isClosing: true });

    expect(isTaskFinalStatus(completed)).toBe(true);
    expect(() => validateTaskCompletion({ status: completed, completedAt: null, outcome: "Done", remarks: null })).toThrow(
      "Completed tasks require a completed date",
    );
    expect(() => validateTaskCompletion({ status: completed, completedAt: "2026-06-27T10:00:00.000Z", outcome: null, remarks: null })).toThrow(
      "Completed tasks require an outcome or remarks",
    );
    expect(() => validateTaskCompletion({ status: cancelled, completedAt: null, outcome: null, remarks: null })).toThrow(
      "Cancelled tasks require an outcome or remarks",
    );
  });

  test("chooses audit action from status and mutation shape", () => {
    expect(buildTaskAuditAction({ created: true, status: status() })).toBe("coordinator_task.create");
    expect(buildTaskAuditAction({ created: false, status: status({ key: "completed", isFinal: true }) })).toBe(
      "coordinator_task.complete",
    );
    expect(buildTaskAuditAction({ created: false, status: status({ key: "cancelled", isFinal: true }) })).toBe(
      "coordinator_task.cancel",
    );
    expect(buildTaskAuditAction({ created: false, status: status() })).toBe("coordinator_task.update");
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
bun test src/lib/adoptions/tasks.test.ts
```

Expected: FAIL because `src/lib/adoptions/tasks.ts` and `CoordinatorTask` do not exist.

- [ ] **Step 3: Add task types**

Modify `src/lib/adoptions/types.ts`:

```ts
export type CoordinatorTaskPriority = "low" | "normal" | "high" | "urgent";
export type CoordinatorTaskContactChannel = "phone" | "whatsapp" | "email" | "in_person" | "internal";

export type CoordinatorTaskCaseLink = {
  id: string;
  applicantName: string;
  animalType: string;
};

export type CoordinatorTaskAdopterLink = {
  id: string;
  supporterId: string | null;
  displayName: string | null;
  isBlacklisted: boolean;
};

export type CoordinatorTaskAnimalLink = {
  id: string;
  name: string;
  nameEn: string | null;
  type: string;
  status: string;
};

export type CoordinatorTask = {
  id: string;
  title: string;
  status: CoordinatorStatus;
  taskType: string;
  priority: CoordinatorTaskPriority;
  dueAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  assignedTo: string | null;
  volunteer: string | null;
  contactChannel: CoordinatorTaskContactChannel | null;
  outcome: string | null;
  nextStepAt: string | null;
  remarks: string | null;
  hasWindowNet: boolean | null;
  environment: string | null;
  score: string | null;
  createdAt: string;
  updatedAt: string;
  adoptionCase: CoordinatorTaskCaseLink | null;
  adopterProfile: CoordinatorTaskAdopterLink | null;
  animal: CoordinatorTaskAnimalLink | null;
};
```

Then either replace `AdoptionFollowup` with `CoordinatorTask` in `AdoptionCaseDetail.followups` or keep:

```ts
export type AdoptionFollowup = CoordinatorTask;
```

- [ ] **Step 4: Add task schemas**

Modify `src/lib/adoptions/schemas.ts`:

```ts
const linkedTaskEntitySchema = z
  .object({
    adoptionCaseId: z.string().uuid().optional(),
    adopterProfileId: z.string().uuid().optional(),
    animalId: z.string().uuid().optional(),
  })
  .refine(
    (value) => Boolean(value.adoptionCaseId || value.adopterProfileId || value.animalId),
    "At least one task link is required",
  );

export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskContactChannelSchema = z.enum(["phone", "whatsapp", "email", "in_person", "internal"]);

const taskFieldsSchema = z.object({
  title: z.string().trim().min(1),
  statusId: z.string().uuid(),
  taskType: optionalTrimmed.default("followup"),
  priority: taskPrioritySchema.default("normal"),
  dueAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  assignedTo: optionalTrimmed,
  volunteer: optionalTrimmed,
  contactChannel: taskContactChannelSchema.optional(),
  outcome: optionalTrimmed,
  nextStepAt: z.string().datetime().optional(),
  remarks: optionalTrimmed,
  hasWindowNet: z.boolean().optional(),
  environment: optionalTrimmed,
  score: optionalTrimmed,
});

export const taskListSearchSchema = z.object({
  q: optionalTrimmed,
  statusId: z.string().uuid().optional(),
  priority: taskPrioritySchema.optional(),
  taskType: optionalTrimmed,
  due: z.enum(["overdue", "today", "upcoming", "none", "all"]).catch("all"),
  adoptionCaseId: z.string().uuid().optional(),
  adopterProfileId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  assignedTo: optionalTrimmed,
  openOnly: booleanSearch.default(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const coordinatorTaskInputSchema = linkedTaskEntitySchema.and(taskFieldsSchema);

export const coordinatorTaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    statusId: z.string().uuid().optional(),
    adoptionCaseId: z.string().uuid().nullable().optional(),
    adopterProfileId: z.string().uuid().nullable().optional(),
    animalId: z.string().uuid().nullable().optional(),
    taskType: optionalTrimmed,
    priority: taskPrioritySchema.optional(),
    dueAt: z.string().datetime().nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
    assignedTo: optionalTrimmed.nullable().optional(),
    volunteer: optionalTrimmed.nullable().optional(),
    contactChannel: taskContactChannelSchema.nullable().optional(),
    outcome: optionalTrimmed.nullable().optional(),
    nextStepAt: z.string().datetime().nullable().optional(),
    remarks: optionalTrimmed.nullable().optional(),
    hasWindowNet: z.boolean().nullable().optional(),
    environment: optionalTrimmed.nullable().optional(),
    score: optionalTrimmed.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Task update cannot be empty");

export const followupInputSchema = taskFieldsSchema.and(
  z.object({
    adopterProfileId: z.string().uuid().optional(),
    animalId: z.string().uuid().optional(),
  }),
);
```

If `.omit()` is not available on the intersection result, define a `taskFieldsSchema` object separately and compose both schemas from it.

- [ ] **Step 5: Add pure helper implementation**

Create `src/lib/adoptions/tasks.ts`:

```ts
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

export function getTaskDueBucket(task: Pick<CoordinatorTask, "dueAt" | "completedAt">, now: Date): TaskDueBucket {
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
  if (input.status.key === "completed" || (isTaskFinalStatus(input.status) && input.status.key !== "cancelled")) {
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
```

- [ ] **Step 6: Run helper and schema-related tests**

Run:

```bash
bun test src/lib/adoptions/tasks.test.ts src/lib/adoptions/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/adoptions/types.ts src/lib/adoptions/schemas.ts src/lib/adoptions/tasks.ts src/lib/adoptions/tasks.test.ts
git commit -m "feat: add coordinator task domain helpers"
```

---

## Task 3: Service Rules And Audit Behavior

**Files:**
- Modify: `src/lib/adoptions/service.ts`
- Modify: `src/lib/adoptions/service.test.ts`

- [ ] **Step 1: Add failing service tests**

Append tests to `src/lib/adoptions/service.test.ts`:

```ts
const adopterProfileId = "99999999-aaaa-4333-8444-555555555555";

test("creates a coordinator task linked to case adopter and animal and audits it", async () => {
  const repo = createRepo();
  const service = createAdoptionCoordinatorService({
    repo,
    now: () => new Date("2026-06-27T10:00:00.000Z"),
  });

  await service.createTask({
    actorUserId: adminId,
    input: {
      title: "Post-adoption call",
      statusId: followupStatusId,
      adoptionCaseId: caseId,
      adopterProfileId,
      animalId,
      priority: "high",
      dueAt: "2026-06-28T10:00:00.000Z",
      contactChannel: "phone",
    },
  });

  expect(repo.calls.map((call) => call.name)).toEqual(["getStatus", "createTask", "insertAuditLog"]);
  expect(repo.calls[1].payload).toMatchObject({
    title: "Post-adoption call",
    adoptionCaseId: caseId,
    adopterProfileId,
    animalId,
    priority: "high",
    createdBy: adminId,
  });
  expect(repo.calls[2].payload).toMatchObject({
    action: "coordinator_task.create",
    entity: "adoption_followup",
    actor_user_id: adminId,
  });
});

test("rejects coordinator tasks without linked entities before repository mutation", async () => {
  const repo = createRepo();
  const service = createAdoptionCoordinatorService({ repo });

  await expect(
    service.createTask({
      actorUserId: adminId,
      input: { title: "Unlinked", statusId: followupStatusId },
    }),
  ).rejects.toThrow("Invalid coordinator request");

  expect(repo.calls).toEqual([]);
});

test("rejects completed task status without completion details before repository mutation", async () => {
  const repo = createRepo({
    async getStatus(id) {
      repo.calls.push({ name: "getStatus", payload: id });
      return status({ id, category: "followup", key: "completed", isFinal: true, isClosing: true });
    },
  });
  const service = createAdoptionCoordinatorService({ repo });

  await expect(
    service.createTask({
      actorUserId: adminId,
      input: {
        title: "Complete home visit",
        statusId: followupStatusId,
        adoptionCaseId: caseId,
      },
    }),
  ).rejects.toThrow("Completed tasks require a completed date");

  expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
});

test("updates coordinator task and audits complete action", async () => {
  const repo = createRepo({
    async getStatus(id) {
      repo.calls.push({ name: "getStatus", payload: id });
      return status({ id, category: "followup", key: "completed", isFinal: true, isClosing: true });
    },
    async updateTask(input) {
      repo.calls.push({ name: "updateTask", payload: input });
      return { id: "followup-1" };
    },
  });
  const service = createAdoptionCoordinatorService({
    repo,
    now: () => new Date("2026-06-27T10:00:00.000Z"),
  });

  await service.updateTask({
    actorUserId: adminId,
    taskId: "followup-1",
    input: {
      statusId: followupStatusId,
      completedAt: "2026-06-27T09:30:00.000Z",
      outcome: "Visit completed",
    },
  });

  expect(repo.calls.map((call) => call.name)).toEqual(["getStatus", "updateTask", "insertAuditLog"]);
  expect(repo.calls[2].payload).toMatchObject({
    action: "coordinator_task.complete",
    entity: "adoption_followup",
    entity_id: "followup-1",
  });
});
```

Update `createRepo()` in the same test file with stub methods:

```ts
async listTasks(input) {
  calls.push({ name: "listTasks", payload: input });
  return { tasks: [], total: 0 };
},
async getTask(id) {
  calls.push({ name: "getTask", payload: id });
  return null;
},
async createTask(input) {
  calls.push({ name: "createTask", payload: input });
  return { id: "followup-1" };
},
async updateTask(input) {
  calls.push({ name: "updateTask", payload: input });
  return { id: input.taskId };
},
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
bun test src/lib/adoptions/service.test.ts
```

Expected: FAIL because task service/repository methods do not exist.

- [ ] **Step 3: Extend repository interface and service exports**

Modify `src/lib/adoptions/service.ts` imports:

```ts
import {
  coordinatorTaskInputSchema,
  coordinatorTaskUpdateSchema,
  taskListSearchSchema,
} from "./schemas";
import { buildTaskAuditAction, validateTaskCompletion } from "./tasks";
import type { CoordinatorTask } from "./types";
```

Add types:

```ts
export type TaskListSearch = z.infer<typeof taskListSearchSchema>;
export type CoordinatorTaskInput = z.infer<typeof coordinatorTaskInputSchema>;
export type CoordinatorTaskUpdate = z.infer<typeof coordinatorTaskUpdateSchema>;
```

Add repository methods:

```ts
listTasks(input: TaskListSearch): Promise<{ tasks: CoordinatorTask[]; total: number }>;
getTask(id: string): Promise<CoordinatorTask | null>;
createTask(
  input: CoordinatorTaskInput & {
    createdBy: string;
  },
): Promise<{ id: string }>;
updateTask(
  input: CoordinatorTaskUpdate & {
    taskId: string;
    updatedBy: string;
  },
): Promise<{ id: string }>;
```

- [ ] **Step 4: Implement service methods**

Inside `createAdoptionCoordinatorService`, add:

```ts
listTasks(rawSearch: unknown) {
  return repo.listTasks(taskListSearchSchema.parse(rawSearch));
},

getTask(taskId: string) {
  return repo.getTask(taskId);
},

async createTask(args: { actorUserId: string; input: unknown }) {
  const input = coordinatorTaskInputSchema.parse(args.input);
  const status = await repo.getStatus(input.statusId);
  if (!status || status.category !== "followup") throw new Error("Invalid followup status");
  if (!status.isActive) throw new Error("Inactive followup status");

  validateTaskCompletion({
    status,
    completedAt: input.completedAt ?? null,
    outcome: input.outcome ?? null,
    remarks: input.remarks ?? null,
  });

  const task = await repo.createTask({
    ...input,
    createdBy: args.actorUserId,
  });

  await repo.insertAuditLog({
    actor_user_id: args.actorUserId,
    action: buildTaskAuditAction({ created: true, status }),
    entity: "adoption_followup",
    entity_id: task.id,
    timestamp: timestamp(now),
    detail: {
      adoptionCaseId: input.adoptionCaseId ?? null,
      adopterProfileId: input.adopterProfileId ?? null,
      animalId: input.animalId ?? null,
      statusId: input.statusId,
      priority: input.priority,
      dueAt: input.dueAt ?? null,
    },
  });

  return task;
},

async updateTask(args: { actorUserId: string; taskId: string; input: unknown }) {
  const input = coordinatorTaskUpdateSchema.parse(args.input);
  let status: CoordinatorStatus | null = null;
  if (input.statusId) {
    status = await repo.getStatus(input.statusId);
    if (!status || status.category !== "followup") throw new Error("Invalid followup status");
    if (!status.isActive) throw new Error("Inactive followup status");
    validateTaskCompletion({
      status,
      completedAt: input.completedAt ?? null,
      outcome: input.outcome ?? null,
      remarks: input.remarks ?? null,
    });
  }

  const task = await repo.updateTask({
    ...input,
    taskId: args.taskId,
    updatedBy: args.actorUserId,
  });

  await repo.insertAuditLog({
    actor_user_id: args.actorUserId,
    action: status
      ? buildTaskAuditAction({ created: false, status })
      : "coordinator_task.update",
    entity: "adoption_followup",
    entity_id: task.id,
    timestamp: timestamp(now),
    detail: input,
  });

  return task;
},
```

Return a named service object so `createFollowup` can delegate to `createTask` without relying on `this` binding. Change the existing `return { ... }` in `createAdoptionCoordinatorService` to `const service = { ... }; return service;`, preserving the current method bodies.

```ts
const service = {
  listStatuses(category?: string) {
    return repo.listStatuses(category);
  },
};

return service;
```

Update existing `createFollowup` inside that object to delegate:

```ts
async createFollowup(args: { actorUserId: string; caseId: string; input: unknown }) {
  return service.createTask({
    actorUserId: args.actorUserId,
    input: {
      ...(args.input as Record<string, unknown>),
      adoptionCaseId: args.caseId,
    },
  });
},
```

- [ ] **Step 5: Run service tests**

Run:

```bash
bun test src/lib/adoptions/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adoptions/service.ts src/lib/adoptions/service.test.ts
git commit -m "feat: add coordinator task service"
```

---

## Task 4: Supabase Repository Mapping And Persistence

**Files:**
- Modify: `src/lib/adoptions/repository.server.ts`
- Modify: `src/lib/adoptions/repository.server.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests to `src/lib/adoptions/repository.server.test.ts` using the existing fake Supabase query builder pattern. Cover these assertions:

```ts
test("creates a coordinator task with case adopter and animal links", async () => {
  const { client, calls } = createFakeSupabaseClient();
  const repo = createSupabaseAdoptionCoordinatorRepository(client as never);

  await repo.createTask({
    title: "Post-adoption call",
    statusId: followupStatusId,
    adoptionCaseId: caseId,
    adopterProfileId,
    animalId,
    taskType: "followup",
    priority: "urgent",
    dueAt: "2026-06-28T10:00:00.000Z",
    scheduledAt: undefined,
    completedAt: undefined,
    assignedTo: "Suki",
    volunteer: undefined,
    contactChannel: "phone",
    outcome: undefined,
    nextStepAt: undefined,
    remarks: "Call adopter",
    hasWindowNet: undefined,
    environment: undefined,
    score: undefined,
    createdBy: adminId,
  });

  expect(callsFor(calls, "adoption_followup", "insert")[0].payload).toMatchObject({
    adoption_case_id: caseId,
    adopter_profile_id: adopterProfileId,
    animal_id: animalId,
    task_type: "followup",
    priority: "urgent",
    assigned_to: "Suki",
    contact_channel: "phone",
    created_by: adminId,
    updated_by: adminId,
  });
});
```

Add a mapping test that feeds a task row with linked case/adopter/animal summaries and expects camelCase output:

```ts
expect(task).toMatchObject({
  id: "followup-1",
  title: "Post-adoption call",
  priority: "high",
  adoptionCase: { id: caseId, applicantName: "Ada", animalType: "cat" },
  adopterProfile: { id: adopterProfileId, supporterId: "supporter-1", displayName: "Ada", isBlacklisted: false },
  animal: { id: animalId, name: "Mochi", nameEn: "Mochi", type: "cat", status: "available" },
});
```

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
bun test src/lib/adoptions/repository.server.test.ts
```

Expected: FAIL because repository task methods and row mapping do not exist.

- [ ] **Step 3: Add row types and mapper**

In `src/lib/adoptions/repository.server.ts`, add `CoordinatorTask` to imports and define:

```ts
type TaskRow = {
  id: string;
  adoption_case_id: string | null;
  adopter_profile_id: string | null;
  animal_id: string | null;
  status_id: string;
  title: string;
  task_type: string;
  priority: CoordinatorTask["priority"];
  due_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  volunteer: string | null;
  contact_channel: CoordinatorTask["contactChannel"];
  outcome: string | null;
  next_step_at: string | null;
  remarks: string | null;
  has_window_net: boolean | null;
  environment: string | null;
  score: string | null;
  created_at: string;
  updated_at: string;
};

type TaskCaseRow = {
  id: string;
  applicant_name: string;
  animal_type: string;
};

type TaskAdopterRow = {
  id: string;
  supporter_id: string | null;
  is_blacklisted: boolean;
  supporter?: { name: string | null } | null;
};

type TaskAnimalRow = {
  id: string;
  name: string;
  name_en: string | null;
  type: string;
  status: string;
};
```

Add mapper:

```ts
function mapTask(
  row: TaskRow,
  statuses: Map<string, CoordinatorStatus>,
  cases: Map<string, TaskCaseRow>,
  adopters: Map<string, TaskAdopterRow>,
  animals: Map<string, TaskAnimalRow>,
): CoordinatorTask {
  const adopter = row.adopter_profile_id ? adopters.get(row.adopter_profile_id) : undefined;
  const adoptionCase = row.adoption_case_id ? cases.get(row.adoption_case_id) : undefined;
  const animal = row.animal_id ? animals.get(row.animal_id) : undefined;

  return {
    id: row.id,
    title: row.title,
    status: requireStatus(statuses, row.status_id),
    taskType: row.task_type,
    priority: row.priority,
    dueAt: row.due_at,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    assignedTo: row.assigned_to,
    volunteer: row.volunteer,
    contactChannel: row.contact_channel,
    outcome: row.outcome,
    nextStepAt: row.next_step_at,
    remarks: row.remarks,
    hasWindowNet: row.has_window_net,
    environment: row.environment,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adoptionCase: adoptionCase
      ? {
          id: adoptionCase.id,
          applicantName: adoptionCase.applicant_name,
          animalType: adoptionCase.animal_type,
        }
      : null,
    adopterProfile: adopter
      ? {
          id: adopter.id,
          supporterId: adopter.supporter_id,
          displayName: adopter.supporter?.name ?? null,
          isBlacklisted: adopter.is_blacklisted,
        }
      : null,
    animal: animal
      ? {
          id: animal.id,
          name: animal.name,
          nameEn: animal.name_en,
          type: animal.type,
          status: animal.status,
        }
      : null,
  };
}
```

- [ ] **Step 4: Add task query helpers**

Add helpers to load linked rows by ids:

```ts
async function loadTaskCasesByIds(client: SupabaseClient, ids: Array<string | null | undefined>) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskCaseRow>();

  const { data, error } = await client
    .from("adoption_case")
    .select("id,applicant_name,animal_type")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskCaseRow[]).map((row) => [row.id, row]));
}

async function loadTaskAdoptersByIds(
  client: SupabaseClient,
  ids: Array<string | null | undefined>,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskAdopterRow>();

  const { data, error } = await client
    .from("adopter_profile")
    .select("id,supporter_id,is_blacklisted,supporter:supporter_id(name)")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskAdopterRow[]).map((row) => [row.id, row]));
}

async function loadTaskAnimalsByIds(
  client: SupabaseClient,
  ids: Array<string | null | undefined>,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskAnimalRow>();

  const { data, error } = await client
    .from("animals")
    .select("id,name,name_en,type,status")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskAnimalRow[]).map((row) => [row.id, row]));
}
```

- [ ] **Step 5: Implement repository methods**

Add methods:

```ts
async listTasks(input) {
  const from = (input.page - 1) * input.pageSize;
  let query = client
    .from("adoption_followup")
    .select("*", { count: "exact" })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.statusId) query = query.eq("status_id", input.statusId);
  if (input.priority) query = query.eq("priority", input.priority);
  if (input.taskType) query = query.eq("task_type", input.taskType);
  if (input.adoptionCaseId) query = query.eq("adoption_case_id", input.adoptionCaseId);
  if (input.adopterProfileId) query = query.eq("adopter_profile_id", input.adopterProfileId);
  if (input.animalId) query = query.eq("animal_id", input.animalId);
  if (input.assignedTo) query = query.ilike("assigned_to", `%${escapeLike(input.assignedTo)}%`);
  if (input.openOnly) query = query.is("completed_at", null);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  if (input.due === "overdue") query = query.lt("due_at", now.toISOString()).is("completed_at", null);
  if (input.due === "today") query = query.gte("due_at", start).lt("due_at", tomorrow);
  if (input.due === "upcoming") query = query.gte("due_at", tomorrow).is("completed_at", null);
  if (input.due === "none") query = query.is("due_at", null);
  if (input.q) query = query.or(`title.ilike.%${escapeLike(input.q)}%,remarks.ilike.%${escapeLike(input.q)}%,outcome.ilike.%${escapeLike(input.q)}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  const rows = (data ?? []) as TaskRow[];
  const statuses = await loadStatusesByIds(client, rows.map((row) => row.status_id));
  const [cases, adopters, animals] = await Promise.all([
    loadTaskCasesByIds(client, rows.map((row) => row.adoption_case_id)),
    loadTaskAdoptersByIds(client, rows.map((row) => row.adopter_profile_id)),
    loadTaskAnimalsByIds(client, rows.map((row) => row.animal_id)),
  ]);
  return { tasks: rows.map((row) => mapTask(row, statuses, cases, adopters, animals)), total: count ?? 0 };
}
```

Add these snake_case persistence mappers:

```ts
function toTaskInsertPayload(input: CoordinatorTaskInput & { createdBy: string }) {
  return {
    adoption_case_id: input.adoptionCaseId ?? null,
    adopter_profile_id: input.adopterProfileId ?? null,
    animal_id: input.animalId ?? null,
    status_id: input.statusId,
    title: input.title,
    task_type: input.taskType,
    priority: input.priority,
    due_at: input.dueAt ?? null,
    scheduled_at: input.scheduledAt ?? null,
    completed_at: input.completedAt ?? null,
    assigned_to: input.assignedTo ?? null,
    volunteer: input.volunteer ?? null,
    contact_channel: input.contactChannel ?? null,
    outcome: input.outcome ?? null,
    next_step_at: input.nextStepAt ?? null,
    remarks: input.remarks ?? null,
    has_window_net: input.hasWindowNet ?? null,
    environment: input.environment ?? null,
    score: input.score ?? null,
    created_by: input.createdBy,
    updated_by: input.createdBy,
  };
}

function toTaskUpdatePayload(input: CoordinatorTaskUpdate & { updatedBy: string }) {
  const payload: Record<string, unknown> = { updated_by: input.updatedBy };
  if (input.adoptionCaseId !== undefined) payload.adoption_case_id = input.adoptionCaseId;
  if (input.adopterProfileId !== undefined) payload.adopter_profile_id = input.adopterProfileId;
  if (input.animalId !== undefined) payload.animal_id = input.animalId;
  if (input.statusId !== undefined) payload.status_id = input.statusId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.taskType !== undefined) payload.task_type = input.taskType;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueAt !== undefined) payload.due_at = input.dueAt;
  if (input.scheduledAt !== undefined) payload.scheduled_at = input.scheduledAt;
  if (input.completedAt !== undefined) payload.completed_at = input.completedAt;
  if (input.assignedTo !== undefined) payload.assigned_to = input.assignedTo;
  if (input.volunteer !== undefined) payload.volunteer = input.volunteer;
  if (input.contactChannel !== undefined) payload.contact_channel = input.contactChannel;
  if (input.outcome !== undefined) payload.outcome = input.outcome;
  if (input.nextStepAt !== undefined) payload.next_step_at = input.nextStepAt;
  if (input.remarks !== undefined) payload.remarks = input.remarks;
  if (input.hasWindowNet !== undefined) payload.has_window_net = input.hasWindowNet;
  if (input.environment !== undefined) payload.environment = input.environment;
  if (input.score !== undefined) payload.score = input.score;
  return payload;
}
```

- [ ] **Step 6: Update case detail repository**

In `getCaseDetail`, update the followup select to include all task columns:

```ts
.select("id,adoption_case_id,adopter_profile_id,animal_id,status_id,title,task_type,priority,due_at,scheduled_at,completed_at,assigned_to,volunteer,contact_channel,outcome,next_step_at,remarks,has_window_net,environment,score,created_at,updated_at")
```

Map with `mapTask` and load linked rows.

- [ ] **Step 7: Run repository tests**

Run:

```bash
bun test src/lib/adoptions/repository.server.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/adoptions/repository.server.ts src/lib/adoptions/repository.server.test.ts
git commit -m "feat: persist coordinator tasks"
```

---

## Task 5: HTTP Handlers And File Routes

**Files:**
- Modify: `src/lib/adoptions/http.server.ts`
- Modify: `src/lib/adoptions/http.test.ts`
- Create: `src/routes/api/admin/adoptions/tasks.ts`
- Create: `src/routes/api/admin/adoptions/tasks/$id.ts`
- Modify: `src/routes/api/admin/adoptions/cases/$id/followups.ts`

- [ ] **Step 1: Add failing handler tests**

Add tests to `src/lib/adoptions/http.test.ts`:

```ts
const taskId = "aaaaaaaa-bbbb-4333-8444-555555555555";

test("task list requires coordinator auth and returns no-store JSON", async () => {
  const { calls, service } = createFakeService({
    async listTasks(rawSearch) {
      calls.push({ name: "listTasks", payload: rawSearch });
      return { tasks: [], total: 0 };
    },
  });
  const handlers = createHandlers({ service });

  const response = await handlers.listTasks({
    request: new Request("https://example.test/api/admin/adoptions/tasks?due=overdue&priority=urgent"),
  });

  expect(response.status).toBe(200);
  expectNoStoreJson(response);
  expect(calls).toEqual([{ name: "listTasks", payload: { due: "overdue", priority: "urgent" } }]);
});

test("task create calls service with actor and JSON body", async () => {
  const requestBody = { title: "Post-adoption call", statusId, adoptionCaseId: caseId };
  const { calls, service } = createFakeService({
    async createTask(payload) {
      calls.push({ name: "createTask", payload });
      return { id: taskId };
    },
  });
  const handlers = createHandlers({ service });

  const response = await handlers.createTask({
    request: jsonRequest("https://example.test/api/admin/adoptions/tasks", requestBody),
  });

  expect(response.status).toBe(201);
  expectNoStoreJson(response);
  expect(calls).toEqual([
    { name: "createTask", payload: { actorUserId: staff.authUserId, input: requestBody } },
  ]);
  expect(await response.json()).toEqual({ task: { id: taskId } });
});

test("task update validates task id before auth or service work", async () => {
  const { calls, service } = createFakeService();
  const handlers = createHandlers({
    service,
    requireCoordinator: async () => {
      throw new Error("auth should not run");
    },
  });

  const response = await handlers.updateTask({
    request: jsonRequest("https://example.test/api/admin/adoptions/tasks/not-a-uuid", {}),
    params: { id: "not-a-uuid" },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid id" });
  expect(calls).toEqual([]);
});

test("case followup route injects case id into task creation path", async () => {
  const { calls, service } = createFakeService({
    async createFollowup(payload) {
      calls.push({ name: "createFollowup", payload });
      return { id: taskId };
    },
  });
  const handlers = createHandlers({ service });

  const response = await handlers.createFollowup({
    request: jsonRequest(`https://example.test/api/admin/adoptions/cases/${caseId}/followups`, {
      title: "Home visit",
      statusId,
    }),
    params: { id: caseId },
  });

  expect(response.status).toBe(201);
  expect(calls).toEqual([
    {
      name: "createFollowup",
      payload: {
        actorUserId: staff.authUserId,
        caseId,
        input: { title: "Home visit", statusId },
      },
    },
  ]);
});
```

Add fake service methods:

```ts
async listTasks(rawSearch) {
  calls.push({ name: "listTasks", payload: rawSearch });
  return { tasks: [], total: 0 };
},
async getTask(id) {
  calls.push({ name: "getTask", payload: id });
  return null;
},
async createTask(payload) {
  calls.push({ name: "createTask", payload });
  return { id: taskId };
},
async updateTask(payload) {
  calls.push({ name: "updateTask", payload });
  return { id: taskId };
},
```

- [ ] **Step 2: Run handler tests and verify they fail**

Run:

```bash
bun test src/lib/adoptions/http.test.ts
```

Expected: FAIL because handlers/routes do not exist.

- [ ] **Step 3: Add handler methods**

In `src/lib/adoptions/http.server.ts`, add domain errors:

```ts
"At least one task link is required",
"Completed tasks require a completed date",
"Completed tasks require an outcome or remarks",
"Cancelled tasks require an outcome or remarks",
```

Add handlers:

```ts
listTasks({ request }: HandlerContext) {
  return withErrors(async () => {
    await requireCoordinator(request);
    const search = Object.fromEntries(new URL(request.url).searchParams);
    return jsonResponse(await service.listTasks(search));
  });
},

createTask({ request }: HandlerContext) {
  return withErrors(async () => {
    const admin = await requireCoordinator(request);
    const task = await service.createTask({
      actorUserId: admin.authUserId,
      input: await jsonBody(request),
    });
    return jsonResponse({ task }, { status: 201 });
  });
},

getTask({ request, params }: HandlerContext) {
  return withErrors(async () => {
    const taskId = requiredUuid(params, "id");
    await requireCoordinator(request);
    const task = await service.getTask(taskId);
    if (!task) return jsonResponse({ error: "Task not found" }, { status: 404 });
    return jsonResponse({ task });
  });
},

updateTask({ request, params }: HandlerContext) {
  return withErrors(async () => {
    const taskId = requiredUuid(params, "id");
    const admin = await requireCoordinator(request);
    const task = await service.updateTask({
      actorUserId: admin.authUserId,
      taskId,
      input: await jsonBody(request),
    });
    return jsonResponse({ task });
  });
},
```

- [ ] **Step 4: Add file routes**

Create `src/routes/api/admin/adoptions/tasks.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoptions/tasks")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listTasks({ request }),
      POST: ({ request }) => createHandlers().createTask({ request }),
    },
  },
});
```

Create `src/routes/api/admin/adoptions/tasks/$id.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/tasks/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getTask({ request, params }),
      PATCH: ({ request, params }) => createHandlers().updateTask({ request, params }),
    },
  },
});
```

Use the exact route imports shown above. `tasks.ts` is a sibling of `-handlers.ts`, and `tasks/$id.ts` reaches the same file through `../-handlers`.

- [ ] **Step 5: Run handler tests**

Run:

```bash
bun test src/lib/adoptions/http.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adoptions/http.server.ts src/lib/adoptions/http.test.ts src/routes/api/admin/adoptions/tasks.ts 'src/routes/api/admin/adoptions/tasks/$id.ts' 'src/routes/api/admin/adoptions/cases/$id/followups.ts'
git commit -m "feat: add coordinator task api"
```

---

## Task 6: Reusable Task Panel And Case Detail Integration

**Files:**
- Create: `src/components/admin/adoptions/taskWorkflowLogic.ts`
- Create: `src/components/admin/adoptions/taskWorkflowLogic.test.ts`
- Create: `src/components/admin/adoptions/TaskPanel.tsx`
- Modify: `src/components/admin/adoptions/CaseDetail.tsx`

- [ ] **Step 1: Write failing task workflow logic tests**

Create `src/components/admin/adoptions/taskWorkflowLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  buildTaskListSearchParams,
  buildTaskPayload,
  getTaskPriorityLabel,
  taskDueLabel,
} from "./taskWorkflowLogic";

describe("task workflow logic", () => {
  test("builds task list query params with trimmed filters", () => {
    expect(
      buildTaskListSearchParams({
        q: "  Ada  ",
        due: "overdue",
        priority: "urgent",
        assignedTo: " Suki ",
        openOnly: true,
        page: 2,
        pageSize: 50,
      }).toString(),
    ).toBe("q=Ada&due=overdue&priority=urgent&assignedTo=Suki&openOnly=true&page=2&pageSize=50");
  });

  test("builds create payload with required links and trimmed optional fields", () => {
    expect(
      buildTaskPayload({
        title: " Home visit ",
        statusId: "status-1",
        adoptionCaseId: "case-1",
        adopterProfileId: "",
        animalId: " animal-1 ",
        priority: "high",
        dueAt: "2026-06-28T10:00:00.000Z",
        assignedTo: " Suki ",
        contactChannel: "phone",
        outcome: " ",
        remarks: " Bring checklist ",
      }),
    ).toEqual({
      title: "Home visit",
      statusId: "status-1",
      adoptionCaseId: "case-1",
      animalId: "animal-1",
      priority: "high",
      dueAt: "2026-06-28T10:00:00.000Z",
      assignedTo: "Suki",
      contactChannel: "phone",
      remarks: "Bring checklist",
    });
  });

  test("formats due and priority labels", () => {
    expect(taskDueLabel("2026-06-27T10:00:00.000Z")).toBe("2026-06-27");
    expect(taskDueLabel(null)).toBe("-");
    expect(getTaskPriorityLabel("urgent")).toBe("Urgent");
  });
});
```

- [ ] **Step 2: Run logic tests and verify they fail**

Run:

```bash
bun test src/components/admin/adoptions/taskWorkflowLogic.test.ts
```

Expected: FAIL because `taskWorkflowLogic.ts` does not exist.

- [ ] **Step 3: Implement task workflow logic**

Create `src/components/admin/adoptions/taskWorkflowLogic.ts`:

```ts
import type {
  CoordinatorTaskContactChannel,
  CoordinatorTaskPriority,
} from "../../../lib/adoptions/types";

export type TaskListFilters = {
  q?: string;
  statusId?: string;
  priority?: CoordinatorTaskPriority | "all";
  taskType?: string;
  due?: "overdue" | "today" | "upcoming" | "none" | "all";
  adoptionCaseId?: string;
  adopterProfileId?: string;
  animalId?: string;
  assignedTo?: string;
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type TaskFormState = {
  title: string;
  statusId: string;
  adoptionCaseId?: string;
  adopterProfileId?: string;
  animalId?: string;
  taskType?: string;
  priority?: CoordinatorTaskPriority;
  dueAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  assignedTo?: string;
  volunteer?: string;
  contactChannel?: CoordinatorTaskContactChannel | "";
  outcome?: string;
  nextStepAt?: string;
  remarks?: string;
};

function trimmed(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : "";
}

function setTrimmed(params: URLSearchParams, key: string, value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (nextValue) params.set(key, nextValue);
}

function normalizedPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

export function buildTaskListSearchParams(filters: TaskListFilters) {
  const params = new URLSearchParams();
  setTrimmed(params, "q", filters.q);
  setTrimmed(params, "statusId", filters.statusId);
  if (filters.priority && filters.priority !== "all") params.set("priority", filters.priority);
  setTrimmed(params, "taskType", filters.taskType);
  if (filters.due && filters.due !== "all") params.set("due", filters.due);
  setTrimmed(params, "adoptionCaseId", filters.adoptionCaseId);
  setTrimmed(params, "adopterProfileId", filters.adopterProfileId);
  setTrimmed(params, "animalId", filters.animalId);
  setTrimmed(params, "assignedTo", filters.assignedTo);
  if (filters.openOnly) params.set("openOnly", "true");
  params.set("page", String(normalizedPositiveInteger(filters.page, 1)));
  params.set("pageSize", String(normalizedPositiveInteger(filters.pageSize, 25)));
  return params;
}

export function buildTaskPayload(form: TaskFormState) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === "string") {
      const nextValue = trimmed(value);
      if (nextValue) payload[key] = nextValue;
    } else if (value !== undefined && value !== null) {
      payload[key] = value;
    }
  }
  return payload;
}

export function taskDueLabel(value: string | null | undefined) {
  const nextValue = trimmed(value);
  return nextValue ? nextValue.slice(0, 10) : "-";
}

export function getTaskPriorityLabel(priority: CoordinatorTaskPriority) {
  const labels: Record<CoordinatorTaskPriority, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  };
  return labels[priority];
}
```

- [ ] **Step 4: Run logic tests**

Run:

```bash
bun test src/components/admin/adoptions/taskWorkflowLogic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create TaskPanel component**

Create `src/components/admin/adoptions/TaskPanel.tsx` with these public props:

```ts
type TaskPanelProps = {
  title: string;
  subtitle?: string;
  tasks: CoordinatorTask[];
  statuses: CoordinatorStatus[];
  defaultLinks: {
    adoptionCaseId?: string;
    adopterProfileId?: string | null;
    animalId?: string | null;
  };
  endpoint?: string;
  onChanged: () => Promise<void> | void;
};
```

Component behavior:

- Use `filterStatusesByCategory(statuses, "followup")` for status options.
- Render a dense table with title, priority, status, due date, assigned person, links, outcome/remarks.
- Include a compact create/edit form in a dialog.
- For create, send `POST` to `endpoint ?? "/api/admin/adoptions/tasks"` with `buildTaskPayload`.
- For update, send `PATCH` to `/api/admin/adoptions/tasks/${task.id}`.
- Use `fetchCoordinatorJson` and TanStack Query `useMutation`.
- Show mutation errors in an element with `role="alert"`.
- Use lucide icons for add/save/check/cancel actions.

Use existing shadcn primitives already imported elsewhere: `Button`, `Dialog`, `Input`, `Label`, `Select`, `Textarea`, `Table`, `Badge`.

- [ ] **Step 6: Integrate TaskPanel into CaseDetail**

In `src/components/admin/adoptions/CaseDetail.tsx`:

- Remove `FollowupsSection`.
- Import `TaskPanel`.
- Render:

```tsx
<TaskPanel
  title="Tasks and follow-ups"
  subtitle={`${adoptionCase.followups.length} open or recorded tasks`}
  tasks={adoptionCase.followups}
  statuses={statuses}
  defaultLinks={{
    adoptionCaseId: caseId,
    adopterProfileId: adoptionCase.adopterProfileId,
  }}
  endpoint={`/api/admin/adoptions/cases/${encodeURIComponent(caseId)}/followups`}
  onChanged={invalidateCase}
/>
```

- [ ] **Step 7: Run focused UI tests and build type check through build**

Run:

```bash
bun test src/components/admin/adoptions/taskWorkflowLogic.test.ts src/components/admin/adoptions/caseWorkflowLogic.test.ts
bun run build
```

Expected: tests PASS and build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/adoptions/taskWorkflowLogic.ts src/components/admin/adoptions/taskWorkflowLogic.test.ts src/components/admin/adoptions/TaskPanel.tsx src/components/admin/adoptions/CaseDetail.tsx
git commit -m "feat: add case coordinator task panel"
```

---

## Task 7: Animal Pipeline Task Section

**Files:**
- Modify: `src/components/admin/adoptions/AnimalPipeline.tsx`
- Modify: `src/components/admin/adoptions/animalPipelineLogic.ts`
- Modify: `src/components/admin/adoptions/animalPipelineLogic.test.ts`

- [ ] **Step 1: Write failing animal task helper test**

Add to `src/components/admin/adoptions/animalPipelineLogic.test.ts`:

```ts
import { buildAnimalTaskSearchParams } from "./animalPipelineLogic";

test("builds animal task search params for the selected animal", () => {
  expect(buildAnimalTaskSearchParams({ animalId: " animal-1 " }).toString()).toBe("animalId=animal-1&openOnly=true&page=1&pageSize=10");
  expect(buildAnimalTaskSearchParams({ animalId: "" }).toString()).toBe("openOnly=true&page=1&pageSize=10");
});
```

- [ ] **Step 2: Run animal logic test and verify it fails**

Run:

```bash
bun test src/components/admin/adoptions/animalPipelineLogic.test.ts
```

Expected: FAIL because `buildAnimalTaskSearchParams` does not exist.

- [ ] **Step 3: Add animal task query helper**

In `src/components/admin/adoptions/animalPipelineLogic.ts`:

```ts
export function buildAnimalTaskSearchParams(filters: { animalId?: string | null }) {
  const params = new URLSearchParams();
  const animalId = trimmed(filters.animalId);
  if (animalId) params.set("animalId", animalId);
  params.set("openOnly", "true");
  params.set("page", "1");
  params.set("pageSize", "10");
  return params;
}
```

- [ ] **Step 4: Add task loading to AnimalPipeline**

In `src/components/admin/adoptions/AnimalPipeline.tsx`:

- Import `TaskPanel`, `CoordinatorTask`, `CoordinatorStatus`.
- Add query for statuses:

```ts
const statusesQuery = useQuery<StatusesResponse, Error>({
  queryKey: ["coordinator-statuses"],
  queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
});
```

- Add selected animal task query:

```ts
const selectedAnimalTasksQuery = useQuery<TaskListResponse, Error>({
  queryKey: ["coordinator-tasks", "animal", selectedAnimalId],
  enabled: Boolean(selectedAnimalId),
  queryFn: () =>
    fetchCoordinatorJson<TaskListResponse>(
      `/api/admin/adoptions/tasks?${buildAnimalTaskSearchParams({ animalId: selectedAnimalId })}`,
    ),
});
```

- In the selected animal edit dialog/panel, render:

```tsx
{selectedAnimalId && (
  <TaskPanel
    title="Animal tasks"
    subtitle="Open coordinator work for this animal"
    tasks={selectedAnimalTasksQuery.data?.tasks ?? []}
    statuses={statusesQuery.data?.statuses ?? []}
    defaultLinks={{ animalId: selectedAnimalId }}
    onChanged={async () => {
      await queryClient.invalidateQueries({ queryKey: ["coordinator-tasks", "animal", selectedAnimalId] });
    }}
  />
)}
```

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
bun test src/components/admin/adoptions/animalPipelineLogic.test.ts
bun run build
```

Expected: PASS and build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/adoptions/AnimalPipeline.tsx src/components/admin/adoptions/animalPipelineLogic.ts src/components/admin/adoptions/animalPipelineLogic.test.ts
git commit -m "feat: show tasks in animal pipeline"
```

---

## Task 8: Coordinator Task Center And Navigation

**Files:**
- Create: `src/components/admin/adoptions/TaskCenter.tsx`
- Create: `src/routes/admin/coordinator/tasks.tsx`
- Modify: `src/components/admin/adminNav.ts`
- Modify: `src/components/admin/adminNav.test.ts`

- [ ] **Step 1: Add failing nav test**

Add to `src/components/admin/adminNav.test.ts`:

```ts
test("uses the coordinator tasks item on its matching route", () => {
  expect(
    getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/tasks", "applications"),
  ).toEqual(["coordinator-tasks"]);
});
```

- [ ] **Step 2: Run nav test and verify it fails**

Run:

```bash
bun test src/components/admin/adminNav.test.ts
```

Expected: FAIL because the nav item does not exist.

- [ ] **Step 3: Add nav item**

Modify `src/components/admin/adminNav.ts`:

```ts
{
  id: "coordinator-tasks",
  section: "applications",
  label: "工作跟進",
  to: "/admin/coordinator/tasks",
  activePath: "/admin/coordinator/tasks",
},
```

Place it near `coordinator-statuses`.

- [ ] **Step 4: Create TaskCenter component**

Create `src/components/admin/adoptions/TaskCenter.tsx`.

Core behavior:

- State for filters: `q`, `due`, `priority`, `assignedTo`, `openOnly`, `page`.
- Use `buildTaskListSearchParams` to call `/api/admin/adoptions/tasks`.
- Use `TaskPanel` or an inline table for list display. If using `TaskPanel`, pass fetched tasks and statuses, with empty `defaultLinks`.
- Summary strip counts tasks in the current page by due bucket and urgent priority.
- Filter controls use existing `Input`, `Select`, `Switch`, and `Button`.
- Empty state text: `No coordinator tasks match these filters`.

Expected response types:

```ts
type TaskListResponse = {
  tasks: CoordinatorTask[];
  total: number;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};
```

- [ ] **Step 5: Create route**

Create `src/routes/admin/coordinator/tasks.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { TaskCenter } from "../../../components/admin/adoptions/TaskCenter";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/tasks")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorTasksPage,
});

function CoordinatorTasksPage() {
  return (
    <AdminLayout activeSection="applications">
      <TaskCenter />
    </AdminLayout>
  );
}
```

- [ ] **Step 6: Run nav test and build**

Run:

```bash
bun test src/components/admin/adminNav.test.ts src/components/admin/adoptions/taskWorkflowLogic.test.ts
bun run build
```

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/adoptions/TaskCenter.tsx src/routes/admin/coordinator/tasks.tsx src/components/admin/adminNav.ts src/components/admin/adminNav.test.ts
git commit -m "feat: add coordinator task center"
```

---

## Task 9: Full Verification And PR Update

**Files:**
- No feature files unless verification exposes defects.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: exit 0. Existing Fast Refresh warnings in shadcn/ui and `src/lib/reveal.tsx` may remain if unchanged.

- [ ] **Step 3: Run production build**

Run:

```bash
bun run build
```

Expected: exit 0. Existing Vite/TanStack module directive warnings may remain if unchanged.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intended tracked changes are committed. Existing untracked `.codex/` and `AGENTS.md` may remain untouched.

- [ ] **Step 5: Push branch**

Run:

```bash
git push
```

Expected: branch `codex/adoption-coordinator-design` updates on origin.

- [ ] **Step 6: Update PR body**

Run:

```bash
gh pr edit 3 --body-file /tmp/hkscda-pr-body.md
```

Use a body that adds this Phase C note:

```md
## Phase C Update
- Adds unified coordinator task/follow-up design and implementation.
- Links tasks to adoption cases, adopter profiles, and animals.
- Adds case task panel, animal task surface, and coordinator task center.
```

- [ ] **Step 7: Final handoff**

Report:

- PR URL.
- Commits added.
- Verification commands and results.
- Any unchanged warnings.
- Whether Supabase migration application was dry-run or still pending environment credentials.
