# HKSCDA Coordinator Phase C Tasks Design

## Summary

Build Coordinator Phase C as a unified task and follow-up timeline for adoption operations. The feature extends the current case-only `adoption_followup` foundation into one coordinator task model that can link to adoption cases, adopter profiles, animals, or any combination of those entities.

The daily staff outcome is simple: coordinators can see what needs doing, create follow-ups from the place they are already working, complete or cancel tasks with outcomes, and keep a no-store audited record of operational work.

## Current Context

The current coordinator branch already includes:

- `adoption_followup` with `adoption_case_id not null`, follow-up status, schedule/completion fields, volunteer, environment, score, and remarks.
- `coordinator_status` rows for `followup`: `open`, `scheduled`, `completed`, and `cancelled`.
- `POST /api/admin/adoptions/cases/$id/followups` for creating case follow-ups.
- Case detail UI that renders a read-only follow-up table.
- Animal pipeline UI with selected animal editing, internal animal profile fields, and status updates.
- `adopter_profile` and `animal_profile_internal` tables from the adoption coordinator foundation.

Phase C should evolve that foundation rather than introduce a separate unrelated task system.

## Goals

1. Create one reusable coordinator task model for cases, adopters, and animals.
2. Make case follow-ups operational: create, list, update, complete, and cancel.
3. Add an animal task surface in the animal pipeline.
4. Add a task center under `/admin/coordinator/tasks` for daily work queue filtering.
5. Preserve the existing case follow-up route as a compatibility wrapper.
6. Gate all task operations to `staff` and `admin` users.
7. Return `cache-control: no-store` for task responses that may contain applicant, adopter, or internal animal context.
8. Audit create, update, complete, and cancel mutations. Ordinary list reads are not audited in this phase.

## Non-Goals

- Full standalone adopter profile UI.
- File upload and attachment storage.
- Automated reminders, WhatsApp messages, or email notifications.
- Calendar integration.
- Volunteer account assignment beyond a free-text assignee/volunteer field.
- Complex status transition rules beyond validating active follow-up statuses.

## Data Model

Extend `public.adoption_followup` into the first version of a coordinator task table.

Add optional links:

- `adopter_profile_id uuid references public.adopter_profile(id) on delete set null`
- `animal_id uuid references public.animals(id) on delete set null`

Change `adoption_case_id` from required to optional, with a table check requiring at least one linked entity:

```sql
check (
  adoption_case_id is not null
  or adopter_profile_id is not null
  or animal_id is not null
)
```

Add operational task fields:

- `task_type text not null default 'followup'`
- `priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent'))`
- `due_at timestamptz`
- `assigned_to text`
- `contact_channel text check (contact_channel is null or contact_channel in ('phone', 'whatsapp', 'email', 'in_person', 'internal'))`
- `outcome text`
- `next_step_at timestamptz`

Keep existing fields where useful:

- `status_id` continues to reference `coordinator_status(category, id)` with `status_category = 'followup'`.
- `scheduled_at`, `completed_at`, `volunteer`, and `remarks` remain supported for existing case follow-up behavior.
- `has_window_net`, `environment`, and `score` remain for home-visit-style follow-ups.

Indexes:

- `(status_id, due_at)`
- `(adoption_case_id, due_at)`
- `(adopter_profile_id, due_at)`
- `(animal_id, due_at)`
- partial overdue helper on `due_at where completed_at is null`

This keeps the database migration small and backwards compatible while making the table polymorphic enough for daily operations.

## Domain Types

Expose a clearer application type named `CoordinatorTask`, backed by `adoption_followup`.

Task fields:

- `id`
- `title`
- `status`
- `taskType`
- `priority`
- `dueAt`
- `scheduledAt`
- `completedAt`
- `assignedTo`
- `volunteer`
- `contactChannel`
- `outcome`
- `nextStepAt`
- `remarks`
- `hasWindowNet`
- `environment`
- `score`
- linked summaries:
  - `adoptionCase`
  - `adopterProfile`
  - `animal`

`AdoptionFollowup` can remain as a compatibility alias or narrow view during migration, but new service/component code should use `CoordinatorTask`.

## API Design

Add task-first routes:

- `GET /api/admin/adoptions/tasks`
- `POST /api/admin/adoptions/tasks`
- `GET /api/admin/adoptions/tasks/$id`
- `PATCH /api/admin/adoptions/tasks/$id`

Keep:

- `POST /api/admin/adoptions/cases/$id/followups`

The case route should call the same service path as `POST /api/admin/adoptions/tasks`, injecting `adoptionCaseId` from the URL.

List query filters:

- `q`
- `statusId`
- `priority`
- `taskType`
- `due`: `overdue`, `today`, `upcoming`, `none`, `all`
- `adoptionCaseId`
- `adopterProfileId`
- `animalId`
- `assignedTo`
- `openOnly`
- `page`
- `pageSize`

Create payload:

```ts
{
  title: string;
  statusId: string;
  adoptionCaseId?: string;
  adopterProfileId?: string;
  animalId?: string;
  taskType?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  dueAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  assignedTo?: string;
  volunteer?: string;
  contactChannel?: "phone" | "whatsapp" | "email" | "in_person" | "internal";
  outcome?: string;
  nextStepAt?: string;
  remarks?: string;
  hasWindowNet?: boolean;
  environment?: string;
  score?: string;
}
```

Patch payload allows the same fields as partial updates.

## Validation Rules

- A task must link to at least one adoption case, adopter profile, or animal.
- `statusId` must exist, be active, and have category `followup`.
- Completed follow-up statuses require `completedAt`.
- Completed follow-up statuses should include either `outcome` or `remarks` so the task has a useful operational record.
- Cancelled follow-up statuses should include `outcome` or `remarks`.
- `dueAt`, `scheduledAt`, `completedAt`, and `nextStepAt` must be valid datetimes when supplied.
- `priority` and `contactChannel` must use the supported values.
- Staff/admin auth must be checked before service or repository work.

## UI Design

### Case Detail

Replace the read-only Follow-ups table with a task panel.

Capabilities:

- Show linked tasks sorted by open first, then overdue/due date, then latest created.
- Create a task already linked to the case.
- Optionally link the case task to the current `adopterProfileId` and selected animal/match.
- Edit status, priority, due date, assigned person, contact channel, outcome, next step date, and remarks.
- Complete or cancel from the row actions.
- Show overdue and urgent tasks prominently.

### Animal Pipeline

Add a compact task section to the selected animal editor.

Capabilities:

- Show tasks linked to that animal.
- Create animal-only tasks, such as foster check, medical reminder, location follow-up, or adoption preparation.
- Show tasks that also came from adoption cases, with case/applicant context as read-only links.

This should fit into the existing animal pipeline dialog/panel rather than creating a new public animal page.

### Coordinator Task Center

Add `/admin/coordinator/tasks`.

This is the daily queue for coordinators.

Layout:

- Filter bar: search, status, priority, due bucket, assigned person, entity filters, open-only.
- Summary strip: overdue, due today, urgent open, scheduled this week.
- Dense table: priority, title, status, due date, linked case/adopter/animal, assigned person, latest outcome.
- Row action: open edit dialog or navigate to linked case/animal context.

The task center is not a project-management app. It is a focused operational queue for adoption work.

## Authorization And Privacy

- `staff` and `admin` can list/create/update tasks.
- `treasurer` does not receive coordinator task access by default.
- Server routes use the service role only after verifying the Supabase Auth user and role.
- Responses containing task context use `cache-control: no-store`.
- Browser components must call admin API routes rather than unauthenticated Supabase client queries for task data.
- Task rows may contain PII in notes/outcomes and should be treated as private coordinator data.

## Audit

Write `audit_log` entries for:

- `coordinator_task.create`
- `coordinator_task.update`
- `coordinator_task.complete`
- `coordinator_task.cancel`

Audit detail should include changed fields, linked entity ids, prior status id when available, next status id, and whether the task was overdue at mutation time.

Do not audit ordinary list reads in this phase. Exports can be audited when Coordinator Phase C expands into report/export readiness.

## Error Handling

- Invalid UUID path or query parameters return 400.
- Missing auth returns 401 before service work.
- Authenticated users without `staff` or `admin` return 403 before service work.
- Unknown task returns 404.
- Invalid status or inactive status returns 400.
- No linked entity returns 400.
- Completion without completion details returns 400.
- Repository conflicts from stale or missing rows return 409 when the update path can distinguish them from validation errors.

## Testing

Automated tests:

- Schema tests for valid single-link and multi-link task payloads.
- Schema tests rejecting no-link payloads and unsupported priority/channel values.
- Service tests for follow-up status validation, inactive status rejection, completion requirements, and audit action selection.
- Repository tests for row mapping with case/adopter/animal summaries.
- Route tests for auth, no-store headers, task list filters, task create/update, and the case follow-up compatibility wrapper.
- Component logic tests for due buckets, overdue sorting, filter param building, and status/priority labels.

Manual smoke checks:

1. Create a task from case detail.
2. Create an animal-only task from animal pipeline.
3. Create a task linked to case, adopter, and animal.
4. Complete a task with outcome and completed date.
5. Cancel a task with remarks.
6. Filter `/admin/coordinator/tasks` by overdue, due today, priority, and assigned person.
7. Confirm responses are no-store.
8. Confirm audit rows are written for create/update/complete/cancel.

## Phasing

Phase C1:

- Migration and types for unified task links and task fields.
- Task schemas, service, repository, routes, and tests.
- Case detail task panel replacing the read-only table.

Phase C2:

- Animal pipeline task section.
- Task center at `/admin/coordinator/tasks`.
- Task filter/grouping logic and tests.

Phase C3:

- Export/report readiness for coordinator tasks.
- Attachment integration.
- Full adopter profile task/history surface.

## Open Decisions

- Use `adoption_followup` as the physical table name for now, with app-level `CoordinatorTask` naming. A future migration can rename the table if the operational language fully shifts from follow-ups to tasks.
- `assigned_to` starts as free text. A later phase can link to staff users once staff profiles exist.
- Adopter-only task display waits for a full adopter profile UI, but the API and database support it immediately.
