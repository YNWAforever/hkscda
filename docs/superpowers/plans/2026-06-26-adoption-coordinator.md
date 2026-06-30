# Adoption Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the heavier adoption coordinator phase with editable workflow statuses, internal adoption cases, adopter profiles, animal matching, successful adoption finalization, follow-ups, attachments metadata, and animal internal profile fields.

**Architecture:** Keep TanStack Start and existing Supabase Auth/admin patterns. Add a server-authorized coordinator domain beside donor ops, with configurable status rows driving workflow behavior rather than hardcoded status enums. Preserve the current public adoption form and animal pages while adding internal admin tables, routes, and UI.

**Tech Stack:** TypeScript 5, TanStack Start file routes, React Query, Supabase Postgres/RLS/Storage, Bun tests, Tailwind v4/shadcn primitives, existing `admin_user` role gate.

---

## File Structure

Create a new coordinator module under `src/lib/adoptions/`:

- `src/lib/adoptions/types.ts`: public TypeScript types for statuses, cases, adopters, matches, follow-ups, attachments, and successful adoptions.
- `src/lib/adoptions/schemas.ts`: Zod validation for status admin, case filters, status transitions, matches, follow-ups, finalization, and animal internal profile updates.
- `src/lib/adoptions/status.ts`: pure helpers for status validation, system-status protection, and transition behavior.
- `src/lib/adoptions/caseFactory.ts`: pure mapping from public application payloads to internal case/adopter/supporter inputs.
- `src/lib/adoptions/service.ts`: coordinator business logic over a repository interface.
- `src/lib/adoptions/repository.server.ts`: Supabase implementation of the repository interface.
- `src/lib/adoptions/http.server.ts`: reusable admin route handlers with no-store JSON responses.
- `src/lib/adoptions/*.test.ts`: Bun tests for pure helpers, service behavior, and HTTP handlers.

Create admin UI components under `src/components/admin/adoptions/`:

- `StatusAdmin.tsx`: manage statuses by category.
- `CaseList.tsx`: searchable/filterable case list.
- `CaseDetail.tsx`: case detail with applicant/adopter data, status changes, follow-ups, matches, attachments, and finalization panel.
- `MatchPanel.tsx`: candidate animal matching controls.
- `FinalizationPanel.tsx`: successful adoption workflow.
- `AnimalPipeline.tsx`: internal animal lifecycle view.
- `api.ts`: admin fetch helper shared by coordinator components.

Create routes:

- `src/routes/admin/applications.tsx`: coordinator case list.
- `src/routes/admin/applications/$id.tsx`: coordinator case detail.
- `src/routes/admin/coordinator/statuses.tsx`: status admin.
- `src/routes/admin/coordinator/animals.tsx`: animal pipeline.
- `src/routes/api/admin/adoptions/statuses.ts`
- `src/routes/api/admin/adoptions/statuses/$id.ts`
- `src/routes/api/admin/adoptions/cases.ts`
- `src/routes/api/admin/adoptions/cases/$id.ts`
- `src/routes/api/admin/adoptions/cases/$id/status.ts`
- `src/routes/api/admin/adoptions/cases/$id/matches.ts`
- `src/routes/api/admin/adoptions/cases/$id/followups.ts`
- `src/routes/api/admin/adoptions/cases/$id/finalize.ts`
- `src/routes/api/admin/adoptions/animals/$id/internal.ts`

Add one Supabase migration with `supabase migration new adoption_coordinator_foundation`.

---

## Task 1: Coordinator Database Foundation

**Files:**

- Create: generated `supabase/migrations/*_adoption_coordinator_foundation.sql`
- Review: `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`
- Review: `supabase/migrations/20260611162942_create_animals_table.sql`
- Review: `supabase/migrations/20260611162956_create_adoption_applications_table.sql`

- [ ] **Step 1: Create migration file**

Run:

```bash
supabase migration new adoption_coordinator_foundation
```

Expected: a generated migration file named like `supabase/migrations/20260626220000_adoption_coordinator_foundation.sql`, with the timestamp chosen by the Supabase CLI.

- [ ] **Step 2: Add coordinator tables and seed statuses**

Write this SQL into the generated migration file:

```sql
create extension if not exists pgcrypto;

create table if not exists public.coordinator_status (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('adoption_case', 'animal_lifecycle', 'match', 'followup', 'final_outcome')),
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label_zh text not null,
  label_en text not null,
  sort_order integer not null default 0,
  color text not null default 'slate',
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_closing boolean not null default false,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, key)
);

create table if not exists public.living_area (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arrival_source (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.animal_position (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'shelter' check (type in ('shelter', 'foster', 'clinic', 'partner', 'other')),
  for_cat boolean not null default true,
  for_dog boolean not null default true,
  address text,
  contact_person text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_fee (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adopter_profile (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null unique references public.supporter(id) on delete cascade,
  name_english text,
  name_chinese text,
  gender text check (gender in ('male', 'female', 'other')),
  hkid text,
  birthday date,
  occupation text,
  facebook text,
  household_size text,
  monthly_household_income text,
  living_area_id uuid references public.living_area(id),
  address text,
  floor_area text,
  is_blacklisted boolean not null default false,
  blacklist_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_case (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid unique references public.adoption_applications(id) on delete set null,
  status_id uuid not null references public.coordinator_status(id),
  adopter_profile_id uuid references public.adopter_profile(id),
  supporter_id uuid references public.supporter(id),
  requested_animal_id uuid references public.animals(id),
  approved_animal_id uuid references public.animals(id),
  animal_type text not null default 'unknown',
  applicant_name text not null,
  applicant_phone text not null,
  applicant_email text,
  applicant_address text,
  housing_type text,
  family_size integer,
  existing_pets text,
  reason text,
  assessment jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  assigned_to uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.animal_match (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null references public.adoption_case(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,
  status_id uuid not null references public.coordinator_status(id),
  is_approved boolean not null default false,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adoption_case_id, animal_id)
);

create table if not exists public.successful_adoption (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null unique references public.adoption_case(id) on delete restrict,
  animal_id uuid not null references public.animals(id) on delete restrict,
  adopter_profile_id uuid not null references public.adopter_profile(id) on delete restrict,
  supporter_id uuid not null references public.supporter(id) on delete restrict,
  outcome_status_id uuid not null references public.coordinator_status(id),
  case_number text not null unique,
  adoption_fee_cents integer check (adoption_fee_cents is null or adoption_fee_cents >= 0),
  approval_date date not null,
  pickup_date date,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_followup (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null references public.adoption_case(id) on delete cascade,
  status_id uuid not null references public.coordinator_status(id),
  title text not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  has_window_net boolean,
  environment text,
  score text,
  volunteer text,
  remarks text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_attachment (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('adoption_case', 'adopter_profile', 'animal', 'followup')),
  entity_id uuid not null,
  file_name text not null,
  storage_bucket text not null default 'adoption-files',
  storage_path text not null,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  is_sensitive boolean not null default true,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.coordinator_status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('adoption_case', 'animal_match', 'animal')),
  entity_id uuid not null,
  status_id uuid not null references public.coordinator_status(id),
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.animal_profile_internal (
  animal_id uuid primary key references public.animals(id) on delete cascade,
  internal_code text unique,
  arrival_date date,
  arrival_source_id uuid references public.arrival_source(id),
  current_position_id uuid references public.animal_position(id),
  cage text,
  has_chip boolean,
  chip_remarks text,
  is_desexed boolean,
  desexed_at date,
  desex_remarks text,
  is_adoptable boolean not null default true,
  is_inside_support_pool boolean not null default false,
  adopted_at date,
  deceased_at date,
  internal_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.coordinator_status
  (category, key, label_zh, label_en, sort_order, color, is_system, is_closing, is_final)
values
  ('adoption_case', 'new', '新申請', 'New', 10, 'blue', true, false, false),
  ('adoption_case', 'screening', '初步審核', 'Screening', 20, 'amber', true, false, false),
  ('adoption_case', 'contacted', '已聯絡', 'Contacted', 30, 'cyan', true, false, false),
  ('adoption_case', 'home_visit', '家訪', 'Home visit', 40, 'purple', true, false, false),
  ('adoption_case', 'matching', '配對中', 'Matching', 50, 'indigo', true, false, false),
  ('adoption_case', 'approved', '已批准', 'Approved', 60, 'green', true, true, true),
  ('adoption_case', 'rejected', '已拒絕', 'Rejected', 70, 'red', true, true, true),
  ('adoption_case', 'withdrawn', '已撤回', 'Withdrawn', 80, 'slate', true, true, true),
  ('adoption_case', 'closed', '已結案', 'Closed', 90, 'slate', true, true, true),
  ('animal_lifecycle', 'available', '可領養', 'Available', 10, 'green', true, false, false),
  ('animal_lifecycle', 'reserved', '已預留', 'Reserved', 20, 'amber', true, false, false),
  ('animal_lifecycle', 'fostered', '暫托中', 'Fostered', 30, 'blue', true, false, false),
  ('animal_lifecycle', 'adopted', '已領養', 'Adopted', 40, 'green', true, true, true),
  ('animal_lifecycle', 'not_adoptable', '暫不可領養', 'Not adoptable', 50, 'slate', true, false, false),
  ('animal_lifecycle', 'medical_hold', '醫療觀察', 'Medical hold', 60, 'red', true, false, false),
  ('animal_lifecycle', 'deceased', '已離世', 'Deceased', 70, 'slate', true, true, true),
  ('match', 'proposed', '建議配對', 'Proposed', 10, 'blue', true, false, false),
  ('match', 'shortlisted', '候選', 'Shortlisted', 20, 'amber', true, false, false),
  ('match', 'approved', '配對批准', 'Approved', 30, 'green', true, true, true),
  ('match', 'declined', '配對不合適', 'Declined', 40, 'red', true, true, true),
  ('match', 'cancelled', '已取消', 'Cancelled', 50, 'slate', true, true, true),
  ('followup', 'open', '待處理', 'Open', 10, 'blue', true, false, false),
  ('followup', 'scheduled', '已安排', 'Scheduled', 20, 'amber', true, false, false),
  ('followup', 'completed', '已完成', 'Completed', 30, 'green', true, true, true),
  ('followup', 'cancelled', '已取消', 'Cancelled', 40, 'slate', true, true, true),
  ('final_outcome', 'adopted', '成功領養', 'Adopted', 10, 'green', true, true, true),
  ('final_outcome', 'rejected', '不批准', 'Rejected', 20, 'red', true, true, true),
  ('final_outcome', 'withdrawn', '申請撤回', 'Withdrawn', 30, 'slate', true, true, true),
  ('final_outcome', 'cancelled', '已取消', 'Cancelled', 40, 'slate', true, true, true)
on conflict (category, key) do nothing;
```

- [ ] **Step 3: Add triggers, indexes, RLS, storage bucket, and policies**

Append:

```sql
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'coordinator_status',
    'living_area',
    'arrival_source',
    'animal_position',
    'adoption_fee',
    'adopter_profile',
    'adoption_case',
    'animal_match',
    'successful_adoption',
    'adoption_followup',
    'animal_profile_internal'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create index if not exists coordinator_status_category_order_idx
  on public.coordinator_status(category, sort_order);
create index if not exists adoption_case_status_created_idx
  on public.adoption_case(status_id, created_at desc);
create index if not exists adoption_case_supporter_idx
  on public.adoption_case(supporter_id);
create index if not exists adoption_case_requested_animal_idx
  on public.adoption_case(requested_animal_id);
create index if not exists animal_match_case_idx
  on public.animal_match(adoption_case_id, is_approved);
create index if not exists animal_match_animal_idx
  on public.animal_match(animal_id);
create index if not exists successful_adoption_animal_idx
  on public.successful_adoption(animal_id);
create index if not exists successful_adoption_supporter_idx
  on public.successful_adoption(supporter_id);
create index if not exists adoption_followup_case_status_idx
  on public.adoption_followup(adoption_case_id, status_id);
create index if not exists adoption_attachment_entity_idx
  on public.adoption_attachment(entity_type, entity_id);
create index if not exists coordinator_status_history_entity_idx
  on public.coordinator_status_history(entity_type, entity_id, created_at desc);
create index if not exists animal_profile_internal_position_idx
  on public.animal_profile_internal(current_position_id);

alter table public.coordinator_status enable row level security;
alter table public.living_area enable row level security;
alter table public.arrival_source enable row level security;
alter table public.animal_position enable row level security;
alter table public.adoption_fee enable row level security;
alter table public.adopter_profile enable row level security;
alter table public.adoption_case enable row level security;
alter table public.animal_match enable row level security;
alter table public.successful_adoption enable row level security;
alter table public.adoption_followup enable row level security;
alter table public.adoption_attachment enable row level security;
alter table public.coordinator_status_history enable row level security;
alter table public.animal_profile_internal enable row level security;

create policy "staff can read coordinator statuses"
  on public.coordinator_status for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can manage coordinator statuses"
  on public.coordinator_status for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read coordinator lookups"
  on public.living_area for select to authenticated using (private.has_admin_role(array['staff', 'admin']));
create policy "admins can manage living areas"
  on public.living_area for all to authenticated using (private.has_admin_role(array['admin'])) with check (private.has_admin_role(array['admin']));
create policy "staff can read arrival sources"
  on public.arrival_source for select to authenticated using (private.has_admin_role(array['staff', 'admin']));
create policy "admins can manage arrival sources"
  on public.arrival_source for all to authenticated using (private.has_admin_role(array['admin'])) with check (private.has_admin_role(array['admin']));
create policy "staff can read animal positions"
  on public.animal_position for select to authenticated using (private.has_admin_role(array['staff', 'admin']));
create policy "admins can manage animal positions"
  on public.animal_position for all to authenticated using (private.has_admin_role(array['admin'])) with check (private.has_admin_role(array['admin']));
create policy "staff can read adoption fees"
  on public.adoption_fee for select to authenticated using (private.has_admin_role(array['staff', 'admin']));
create policy "admins can manage adoption fees"
  on public.adoption_fee for all to authenticated using (private.has_admin_role(array['admin'])) with check (private.has_admin_role(array['admin']));

create policy "staff can manage adopter profiles"
  on public.adopter_profile for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption cases"
  on public.adoption_case for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage animal matches"
  on public.animal_match for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage successful adoptions"
  on public.successful_adoption for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption followups"
  on public.adoption_followup for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption attachments"
  on public.adoption_attachment for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read status history"
  on public.coordinator_status_history for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can insert status history"
  on public.coordinator_status_history for insert
  to authenticated
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage animal internal profiles"
  on public.animal_profile_internal for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit)
values ('adoption-files', 'adoption-files', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "staff can read adoption files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'adoption-files' and private.has_admin_role(array['staff', 'admin']));

create policy "staff can insert adoption files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'adoption-files' and private.has_admin_role(array['staff', 'admin']));

create policy "staff can update adoption files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'adoption-files' and private.has_admin_role(array['staff', 'admin']))
  with check (bucket_id = 'adoption-files' and private.has_admin_role(array['staff', 'admin']));
```

- [ ] **Step 4: Verify migration syntax locally**

Run:

```bash
supabase db lint --linked
```

Expected: no SQL syntax errors for the new migration. If the linked project needs a DB password, record the exact CLI error and continue with `bun test` verification after implementation.

- [ ] **Step 5: Commit database foundation**

```bash
git add supabase/migrations/*_adoption_coordinator_foundation.sql
git commit -m "feat: add adoption coordinator schema"
```

---

## Task 2: Coordinator Domain Types, Schemas, And Pure Helpers

**Files:**

- Create: `src/lib/adoptions/types.ts`
- Create: `src/lib/adoptions/schemas.ts`
- Create: `src/lib/adoptions/status.ts`
- Create: `src/lib/adoptions/caseFactory.ts`
- Test: `src/lib/adoptions/status.test.ts`
- Test: `src/lib/adoptions/schemas.test.ts`
- Test: `src/lib/adoptions/caseFactory.test.ts`

- [ ] **Step 1: Add domain types**

Create `src/lib/adoptions/types.ts`:

```ts
export type CoordinatorStatusCategory =
  | "adoption_case"
  | "animal_lifecycle"
  | "match"
  | "followup"
  | "final_outcome";

export type CoordinatorStatus = {
  id: string;
  category: CoordinatorStatusCategory;
  key: string;
  labelZh: string;
  labelEn: string;
  sortOrder: number;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  isClosing: boolean;
  isFinal: boolean;
};

export type AdoptionCaseSummary = {
  id: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string | null;
  animalType: string;
  requestedAnimalName: string | null;
  status: CoordinatorStatus;
  createdAt: string;
  closedAt: string | null;
};

export type AdoptionCaseDetail = AdoptionCaseSummary & {
  applicantAddress: string | null;
  housingType: string | null;
  familySize: number | null;
  existingPets: string | null;
  reason: string | null;
  supporterId: string | null;
  adopterProfileId: string | null;
  assessment: Record<string, unknown>;
  preferences: Record<string, unknown>;
  matches: AnimalMatchSummary[];
  followups: AdoptionFollowup[];
  successfulAdoption: SuccessfulAdoption | null;
};

export type AnimalMatchSummary = {
  id: string;
  animalId: string;
  animalName: string;
  status: CoordinatorStatus;
  isApproved: boolean;
  notes: string | null;
};

export type AdoptionFollowup = {
  id: string;
  title: string;
  status: CoordinatorStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  volunteer: string | null;
  remarks: string | null;
};

export type SuccessfulAdoption = {
  id: string;
  caseNumber: string;
  animalId: string;
  supporterId: string;
  adopterProfileId: string;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};
```

- [ ] **Step 2: Write failing status helper tests**

Create `src/lib/adoptions/status.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { assertCanMutateStatus, normalizeStatusKey } from "./status";
import type { CoordinatorStatus } from "./types";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    category: "adoption_case",
    key: "new",
    labelZh: "新申請",
    labelEn: "New",
    sortOrder: 10,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

describe("coordinator status helpers", () => {
  test("normalizes staff-entered keys", () => {
    expect(normalizeStatusKey(" Home Visit ")).toBe("home_visit");
    expect(normalizeStatusKey("已 批准")).toBe("");
  });

  test("prevents deleting system statuses", () => {
    expect(() => assertCanMutateStatus(status(), { delete: true })).toThrow(
      "System statuses cannot be deleted",
    );
  });

  test("prevents changing system status keys", () => {
    expect(() => assertCanMutateStatus(status(), { nextKey: "fresh" })).toThrow(
      "System status keys cannot be changed",
    );
  });

  test("allows relabeling system statuses", () => {
    expect(() => assertCanMutateStatus(status(), { nextLabelZh: "新個案" })).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement status helpers**

Create `src/lib/adoptions/status.ts`:

```ts
import type { CoordinatorStatus } from "./types";

export function normalizeStatusKey(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return /^[a-z][a-z0-9_]*$/.test(key) ? key : "";
}

export function assertCanMutateStatus(
  current: CoordinatorStatus,
  change: {
    delete?: boolean;
    nextKey?: string;
    nextLabelZh?: string;
    nextLabelEn?: string;
  },
) {
  if (current.isSystem && change.delete) {
    throw new Error("System statuses cannot be deleted");
  }
  if (current.isSystem && change.nextKey !== undefined && change.nextKey !== current.key) {
    throw new Error("System status keys cannot be changed");
  }
}
```

- [ ] **Step 4: Add Zod schemas and tests**

Create `src/lib/adoptions/schemas.ts`:

```ts
import { z } from "zod";

export const statusCategories = [
  "adoption_case",
  "animal_lifecycle",
  "match",
  "followup",
  "final_outcome",
] as const;

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

export const statusInputSchema = z.object({
  category: z.enum(statusCategories),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  labelZh: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  color: z.string().trim().min(1).default("slate"),
  isActive: z.boolean().default(true),
  isClosing: z.boolean().default(false),
  isFinal: z.boolean().default(false),
});

export const statusUpdateSchema = statusInputSchema.partial().extend({
  delete: z.boolean().optional(),
});

export const caseSearchSchema = z.object({
  q: optionalTrimmed,
  statusId: z.string().uuid().optional(),
  animalType: optionalTrimmed,
  openOnly: z.coerce.boolean().catch(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const statusTransitionSchema = z.object({
  statusId: z.string().uuid(),
  note: optionalTrimmed,
});

export const matchInputSchema = z.object({
  animalId: z.string().uuid(),
  statusId: z.string().uuid(),
  notes: optionalTrimmed,
});

export const followupInputSchema = z.object({
  title: z.string().trim().min(1),
  statusId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  hasWindowNet: z.boolean().optional(),
  environment: optionalTrimmed,
  score: optionalTrimmed,
  volunteer: optionalTrimmed,
  remarks: optionalTrimmed,
});

export const finalizeAdoptionSchema = z.object({
  matchId: z.string().uuid(),
  outcomeStatusId: z.string().uuid(),
  caseNumber: z.string().trim().min(1),
  adoptionFeeCents: z.number().int().min(0).nullable().optional(),
  approvalDate: z.string().date(),
  pickupDate: z.string().date().nullable().optional(),
});
```

Create `src/lib/adoptions/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { caseSearchSchema, statusInputSchema } from "./schemas";

describe("adoption coordinator schemas", () => {
  test("normalizes case search defaults", () => {
    expect(caseSearchSchema.parse({ q: " Ada ", page: "0", pageSize: "500" })).toEqual({
      q: "Ada",
      animalType: undefined,
      openOnly: false,
      page: 1,
      pageSize: 25,
    });
  });

  test("rejects invalid status keys", () => {
    expect(() =>
      statusInputSchema.parse({
        category: "adoption_case",
        key: "已批准",
        labelZh: "已批准",
        labelEn: "Approved",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 5: Add public application case factory**

Create `src/lib/adoptions/caseFactory.ts`:

```ts
export type PublicApplicationInput = {
  id?: string;
  animal_id?: string | null;
  animal_name: string;
  animal_type: string;
  applicant_name: string;
  phone: string;
  email: string;
  address: string;
  housing_type: string;
  family_size?: number | null;
  existing_pets?: string | null;
  reason: string;
};

export function buildCaseFromPublicApplication(input: PublicApplicationInput) {
  return {
    publicApplicationId: input.id ?? null,
    requestedAnimalId: input.animal_id ?? null,
    animalType: input.animal_type,
    applicantName: input.applicant_name.trim(),
    applicantPhone: input.phone.trim(),
    applicantEmail: input.email.trim().toLowerCase(),
    applicantAddress: input.address.trim(),
    housingType: input.housing_type,
    familySize: input.family_size ?? null,
    existingPets: input.existing_pets?.trim() || null,
    reason: input.reason.trim(),
    preferences: {
      animalName: input.animal_name,
    },
  };
}
```

Create `src/lib/adoptions/caseFactory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildCaseFromPublicApplication } from "./caseFactory";

describe("buildCaseFromPublicApplication", () => {
  test("normalizes public form data for internal cases", () => {
    expect(
      buildCaseFromPublicApplication({
        id: "11111111-2222-4333-8444-555555555555",
        animal_id: null,
        animal_name: "Mochi",
        animal_type: "cat",
        applicant_name: " Ada ",
        phone: " 9123 4567 ",
        email: "ADA@EXAMPLE.COM",
        address: "HK",
        housing_type: "私人樓宇",
        family_size: null,
        existing_pets: "",
        reason: "I can provide a safe home.",
      }),
    ).toMatchObject({
      applicantName: "Ada",
      applicantPhone: "9123 4567",
      applicantEmail: "ada@example.com",
      existingPets: null,
      preferences: { animalName: "Mochi" },
    });
  });
});
```

- [ ] **Step 6: Run pure tests**

```bash
bun test src/lib/adoptions/status.test.ts src/lib/adoptions/schemas.test.ts src/lib/adoptions/caseFactory.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit domain helpers**

```bash
git add src/lib/adoptions
git commit -m "feat: add adoption coordinator domain helpers"
```

---

## Task 3: Coordinator Service And Repository

**Files:**

- Create: `src/lib/adoptions/service.ts`
- Create: `src/lib/adoptions/repository.server.ts`
- Test: `src/lib/adoptions/service.test.ts`

- [ ] **Step 1: Write service tests for status protection and case transitions**

Create `src/lib/adoptions/service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createAdoptionCoordinatorService, type AdoptionCoordinatorRepository } from "./service";
import type { CoordinatorStatus } from "./types";

const adminId = "11111111-2222-4333-8444-555555555555";
const caseId = "22222222-3333-4333-8444-555555555555";
const statusId = "33333333-4444-4333-8444-555555555555";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: statusId,
    category: "adoption_case",
    key: "new",
    labelZh: "新申請",
    labelEn: "New",
    sortOrder: 10,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

function createRepo(): AdoptionCoordinatorRepository & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listStatuses() {
      calls.push("listStatuses");
      return [status()];
    },
    async getStatus() {
      calls.push("getStatus");
      return status();
    },
    async createStatus() {
      calls.push("createStatus");
      return status({ isSystem: false, key: "custom" });
    },
    async updateStatus() {
      calls.push("updateStatus");
      return status();
    },
    async deleteStatus() {
      calls.push("deleteStatus");
    },
    async listCases() {
      calls.push("listCases");
      return { cases: [], total: 0 };
    },
    async getCaseDetail() {
      calls.push("getCaseDetail");
      return null;
    },
    async updateCaseStatus() {
      calls.push("updateCaseStatus");
    },
    async insertStatusHistory() {
      calls.push("insertStatusHistory");
    },
    async insertAuditLog() {
      calls.push("insertAuditLog");
    },
    async createMatch() {
      calls.push("createMatch");
      return { id: "match-1" };
    },
    async createFollowup() {
      calls.push("createFollowup");
      return { id: "followup-1" };
    },
    async finalizeAdoption() {
      calls.push("finalizeAdoption");
      return { id: "success-1" };
    },
  };
}

describe("createAdoptionCoordinatorService", () => {
  test("prevents deleting system statuses before repository mutation", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(service.deleteStatus({ actorUserId: adminId, statusId })).rejects.toThrow(
      "System statuses cannot be deleted",
    );
    expect(repo.calls).toEqual(["getStatus"]);
  });

  test("records history and audit when changing case status", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await service.changeCaseStatus({
      actorUserId: adminId,
      caseId,
      input: { statusId, note: "Phone screening completed" },
    });

    expect(repo.calls).toEqual([
      "getStatus",
      "updateCaseStatus",
      "insertStatusHistory",
      "insertAuditLog",
    ]);
  });
});
```

- [ ] **Step 2: Implement service interface**

Create `src/lib/adoptions/service.ts`:

```ts
import { assertCanMutateStatus } from "./status";
import {
  caseSearchSchema,
  finalizeAdoptionSchema,
  followupInputSchema,
  matchInputSchema,
  statusInputSchema,
  statusTransitionSchema,
  statusUpdateSchema,
} from "./schemas";
import type { AdoptionCaseDetail, AdoptionCaseSummary, CoordinatorStatus } from "./types";

export type AdoptionCoordinatorRepository = {
  listStatuses(category?: string): Promise<CoordinatorStatus[]>;
  getStatus(id: string): Promise<CoordinatorStatus | null>;
  createStatus(input: unknown): Promise<CoordinatorStatus>;
  updateStatus(id: string, input: unknown): Promise<CoordinatorStatus>;
  deleteStatus(id: string): Promise<void>;
  listCases(input: unknown): Promise<{ cases: AdoptionCaseSummary[]; total: number }>;
  getCaseDetail(id: string): Promise<AdoptionCaseDetail | null>;
  updateCaseStatus(input: { caseId: string; statusId: string; closedAt: string | null }): Promise<void>;
  insertStatusHistory(input: {
    entityType: "adoption_case" | "animal_match" | "animal";
    entityId: string;
    statusId: string;
    actorUserId: string;
    note: string | null;
  }): Promise<void>;
  insertAuditLog(input: {
    actor_user_id: string | null;
    action: string;
    entity: string;
    entity_id: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
  createMatch(input: unknown): Promise<{ id: string }>;
  createFollowup(input: unknown): Promise<{ id: string }>;
  finalizeAdoption(input: unknown): Promise<{ id: string }>;
};

export function createAdoptionCoordinatorService({ repo, now = () => new Date() }: {
  repo: AdoptionCoordinatorRepository;
  now?: () => Date;
}) {
  return {
    listStatuses(category?: string) {
      return repo.listStatuses(category);
    },

    async createStatus(args: { actorUserId: string; input: unknown }) {
      const input = statusInputSchema.parse(args.input);
      const status = await repo.createStatus(input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.create",
        entity: "coordinator_status",
        entity_id: status.id,
        detail: { category: status.category, key: status.key },
      });
      return status;
    },

    async updateStatus(args: { actorUserId: string; statusId: string; input: unknown }) {
      const current = await repo.getStatus(args.statusId);
      if (!current) throw new Error("Status not found");
      const input = statusUpdateSchema.parse(args.input);
      assertCanMutateStatus(current, { nextKey: input.key });
      const status = await repo.updateStatus(args.statusId, input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.update",
        entity: "coordinator_status",
        entity_id: args.statusId,
        detail: input,
      });
      return status;
    },

    async deleteStatus(args: { actorUserId: string; statusId: string }) {
      const current = await repo.getStatus(args.statusId);
      if (!current) throw new Error("Status not found");
      assertCanMutateStatus(current, { delete: true });
      await repo.deleteStatus(args.statusId);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.delete",
        entity: "coordinator_status",
        entity_id: args.statusId,
        detail: { category: current.category, key: current.key },
      });
    },

    listCases(rawSearch: unknown) {
      return repo.listCases(caseSearchSchema.parse(rawSearch));
    },

    getCaseDetail(caseId: string) {
      return repo.getCaseDetail(caseId);
    },

    async changeCaseStatus(args: { actorUserId: string; caseId: string; input: unknown }) {
      const input = statusTransitionSchema.parse(args.input);
      const status = await repo.getStatus(input.statusId);
      if (!status || status.category !== "adoption_case") throw new Error("Invalid case status");
      await repo.updateCaseStatus({
        caseId: args.caseId,
        statusId: input.statusId,
        closedAt: status.isClosing ? now().toISOString() : null,
      });
      await repo.insertStatusHistory({
        entityType: "adoption_case",
        entityId: args.caseId,
        statusId: input.statusId,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "adoption_case.status_change",
        entity: "adoption_case",
        entity_id: args.caseId,
        detail: { statusId: input.statusId, note: input.note ?? null },
      });
    },

    createMatch(args: { actorUserId: string; caseId: string; input: unknown }) {
      return repo.createMatch({ adoptionCaseId: args.caseId, ...matchInputSchema.parse(args.input), createdBy: args.actorUserId });
    },

    createFollowup(args: { actorUserId: string; caseId: string; input: unknown }) {
      return repo.createFollowup({ adoptionCaseId: args.caseId, ...followupInputSchema.parse(args.input), createdBy: args.actorUserId });
    },

    finalizeAdoption(args: { actorUserId: string; caseId: string; input: unknown }) {
      return repo.finalizeAdoption({ adoptionCaseId: args.caseId, ...finalizeAdoptionSchema.parse(args.input), approvedBy: args.actorUserId });
    },
  };
}
```

- [ ] **Step 3: Implement repository mapping**

Create `src/lib/adoptions/repository.server.ts` with Supabase queries matching the service interface. Start with status and case list/detail methods:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdoptionCoordinatorRepository } from "./service";
import type { CoordinatorStatus } from "./types";

function mapStatus(row: Record<string, unknown>): CoordinatorStatus {
  return {
    id: row.id as string,
    category: row.category as CoordinatorStatus["category"],
    key: row.key as string,
    labelZh: row.label_zh as string,
    labelEn: row.label_en as string,
    sortOrder: row.sort_order as number,
    color: row.color as string,
    isActive: row.is_active as boolean,
    isSystem: row.is_system as boolean,
    isClosing: row.is_closing as boolean,
    isFinal: row.is_final as boolean,
  };
}

export function createSupabaseAdoptionCoordinatorRepository(
  client: SupabaseClient,
): AdoptionCoordinatorRepository {
  return {
    async listStatuses(category) {
      let query = client
        .from("coordinator_status")
        .select("*")
        .order("category")
        .order("sort_order", { ascending: true });
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapStatus(row as Record<string, unknown>));
    },

    async getStatus(id) {
      const { data, error } = await client
        .from("coordinator_status")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStatus(data as Record<string, unknown>) : null;
    },

    async createStatus(input) {
      const { data, error } = await client
        .from("coordinator_status")
        .insert({
          category: input.category,
          key: input.key,
          label_zh: input.labelZh,
          label_en: input.labelEn,
          sort_order: input.sortOrder,
          color: input.color,
          is_active: input.isActive,
          is_closing: input.isClosing,
          is_final: input.isFinal,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as Record<string, unknown>);
    },

    async updateStatus(id, input) {
      const payload: Record<string, unknown> = {};
      if (input.key !== undefined) payload.key = input.key;
      if (input.labelZh !== undefined) payload.label_zh = input.labelZh;
      if (input.labelEn !== undefined) payload.label_en = input.labelEn;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      if (input.color !== undefined) payload.color = input.color;
      if (input.isActive !== undefined) payload.is_active = input.isActive;
      if (input.isClosing !== undefined) payload.is_closing = input.isClosing;
      if (input.isFinal !== undefined) payload.is_final = input.isFinal;
      const { data, error } = await client
        .from("coordinator_status")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as Record<string, unknown>);
    },

    async deleteStatus(id) {
      const { error } = await client.from("coordinator_status").delete().eq("id", id);
      if (error) throw error;
    },

    async listCases() {
      return { cases: [], total: 0 };
    },

    async getCaseDetail() {
      return null;
    },

    async updateCaseStatus(input) {
      const { error } = await client
        .from("adoption_case")
        .update({ status_id: input.statusId, closed_at: input.closedAt })
        .eq("id", input.caseId);
      if (error) throw error;
    },

    async insertStatusHistory(input) {
      const { error } = await client.from("coordinator_status_history").insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        status_id: input.statusId,
        actor_user_id: input.actorUserId,
        note: input.note,
      });
      if (error) throw error;
    },

    async insertAuditLog(input) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },

    async createMatch(input) {
      const { data, error } = await client
        .from("animal_match")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          animal_id: input.animalId,
          status_id: input.statusId,
          notes: input.notes ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async createFollowup(input) {
      const { data, error } = await client
        .from("adoption_followup")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          status_id: input.statusId,
          title: input.title,
          scheduled_at: input.scheduledAt ?? null,
          completed_at: input.completedAt ?? null,
          has_window_net: input.hasWindowNet ?? null,
          environment: input.environment ?? null,
          score: input.score ?? null,
          volunteer: input.volunteer ?? null,
          remarks: input.remarks ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async finalizeAdoption(input) {
      const { data, error } = await client
        .from("successful_adoption")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          animal_id: input.animalId,
          adopter_profile_id: input.adopterProfileId,
          supporter_id: input.supporterId,
          outcome_status_id: input.outcomeStatusId,
          case_number: input.caseNumber,
          adoption_fee_cents: input.adoptionFeeCents ?? null,
          approval_date: input.approvalDate,
          pickup_date: input.pickupDate ?? null,
          approved_by: input.approvedBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },
  };
}
```

- [ ] **Step 4: Run service tests**

```bash
bun test src/lib/adoptions/service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit service/repository**

```bash
git add src/lib/adoptions supabase/migrations
git commit -m "feat: add adoption coordinator service"
```

---

## Task 4: Admin HTTP Routes

**Files:**

- Create: `src/lib/adoptions/http.server.ts`
- Create: `src/lib/adoptions/http.test.ts`
- Create: `src/routes/api/admin/adoptions/_handlers.ts`
- Create route files under `src/routes/api/admin/adoptions/**`
- Modify generated: `src/routeTree.gen.ts`

- [ ] **Step 1: Add HTTP handler tests**

Create `src/lib/adoptions/http.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../donations/supabase.server";
import { createAdoptionCoordinatorHandlers } from "./http.server";

const admin: AdminUser = {
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "admin@example.com",
  role: "admin",
};

function service() {
  const calls: string[] = [];
  return {
    calls,
    async listStatuses() {
      calls.push("listStatuses");
      return [];
    },
    async createStatus() {
      calls.push("createStatus");
      return { id: "status-1" };
    },
    async updateStatus() {
      calls.push("updateStatus");
      return { id: "status-1" };
    },
    async deleteStatus() {
      calls.push("deleteStatus");
    },
    async listCases() {
      calls.push("listCases");
      return { cases: [], total: 0 };
    },
    async getCaseDetail() {
      calls.push("getCaseDetail");
      return null;
    },
    async changeCaseStatus() {
      calls.push("changeCaseStatus");
    },
    async createMatch() {
      calls.push("createMatch");
      return { id: "match-1" };
    },
    async createFollowup() {
      calls.push("createFollowup");
      return { id: "followup-1" };
    },
    async finalizeAdoption() {
      calls.push("finalizeAdoption");
      return { id: "success-1" };
    },
  };
}

describe("createAdoptionCoordinatorHandlers", () => {
  test("requires admin before listing cases", async () => {
    const fake = service();
    const handlers = createAdoptionCoordinatorHandlers({
      requireCoordinator: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service: fake,
    });

    const response = await handlers.listCases({
      request: new Request("https://example.com/api/admin/adoptions/cases"),
    });

    expect(response.status).toBe(403);
    expect(fake.calls).toEqual([]);
  });

  test("returns no-store JSON for statuses", async () => {
    const fake = service();
    const handlers = createAdoptionCoordinatorHandlers({
      requireCoordinator: async () => admin,
      service: fake,
    });

    const response = await handlers.listStatuses({
      request: new Request("https://example.com/api/admin/adoptions/statuses"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ statuses: [] });
  });
});
```

- [ ] **Step 2: Implement handler factory**

Create `src/lib/adoptions/http.server.ts`:

```ts
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createAdoptionCoordinatorService } from "./service";

type Service = ReturnType<typeof createAdoptionCoordinatorService>;

type Context = {
  request: Request;
  params?: Record<string, string | undefined>;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function requiredUuid(params: Context["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

async function withErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return jsonResponse({ error: "Invalid coordinator request" }, { status: 400 });
    console.error(error);
    return jsonResponse({ error: "Could not process coordinator request" }, { status: 500 });
  }
}

export function createAdoptionCoordinatorHandlers(args: {
  requireCoordinator: (request: Request) => Promise<AdminUser>;
  service: Service;
}) {
  return {
    listStatuses({ request }: Context) {
      return withErrors(async () => {
        await args.requireCoordinator(request);
        const category = new URL(request.url).searchParams.get("category") ?? undefined;
        return jsonResponse({ statuses: await args.service.listStatuses(category) });
      });
    },
    createStatus({ request }: Context) {
      return withErrors(async () => {
        const admin = await args.requireCoordinator(request);
        return jsonResponse(await args.service.createStatus({ actorUserId: admin.authUserId, input: await jsonBody(request) }), { status: 201 });
      });
    },
    updateStatus({ request, params }: Context) {
      return withErrors(async () => {
        const statusId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        return jsonResponse(await args.service.updateStatus({ actorUserId: admin.authUserId, statusId, input: await jsonBody(request) }));
      });
    },
    deleteStatus({ request, params }: Context) {
      return withErrors(async () => {
        const statusId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        await args.service.deleteStatus({ actorUserId: admin.authUserId, statusId });
        return jsonResponse({ ok: true });
      });
    },
    listCases({ request }: Context) {
      return withErrors(async () => {
        await args.requireCoordinator(request);
        return jsonResponse(await args.service.listCases(Object.fromEntries(new URL(request.url).searchParams)));
      });
    },
    getCase({ request, params }: Context) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        await args.requireCoordinator(request);
        const detail = await args.service.getCaseDetail(caseId);
        return detail ? jsonResponse({ case: detail }) : jsonResponse({ error: "Case not found" }, { status: 404 });
      });
    },
    changeCaseStatus({ request, params }: Context) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        await args.service.changeCaseStatus({ actorUserId: admin.authUserId, caseId, input: await jsonBody(request) });
        return jsonResponse({ ok: true });
      });
    },
    createMatch({ request, params }: Context) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        return jsonResponse(await args.service.createMatch({ actorUserId: admin.authUserId, caseId, input: await jsonBody(request) }), { status: 201 });
      });
    },
    createFollowup({ request, params }: Context) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        return jsonResponse(await args.service.createFollowup({ actorUserId: admin.authUserId, caseId, input: await jsonBody(request) }), { status: 201 });
      });
    },
    finalizeAdoption({ request, params }: Context) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await args.requireCoordinator(request);
        return jsonResponse(await args.service.finalizeAdoption({ actorUserId: admin.authUserId, caseId, input: await jsonBody(request) }), { status: 201 });
      });
    },
  };
}
```

- [ ] **Step 3: Add route factory helper**

Create `src/routes/api/admin/adoptions/_handlers.ts`:

```ts
import { createAdoptionCoordinatorHandlers } from "../../../../../lib/adoptions/http.server";
import { createSupabaseAdoptionCoordinatorRepository } from "../../../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../../../lib/adoptions/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdoptionCoordinatorHandlers({
    requireCoordinator: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createAdoptionCoordinatorService({
      repo: createSupabaseAdoptionCoordinatorRepository(client),
    }),
  });
}
```

- [ ] **Step 4: Add API route files**

For `src/routes/api/admin/adoptions/statuses.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./_handlers";

export const Route = createFileRoute("/api/admin/adoptions/statuses")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listStatuses({ request }),
      POST: ({ request }) => createHandlers().createStatus({ request }),
    },
  },
});
```

Create `_handlers.ts` in `src/routes/api/admin/adoptions/` with the helper from Step 3. Then add the other route files using their matching handler method.

- [ ] **Step 5: Run HTTP tests and route generation build**

```bash
bun test src/lib/adoptions/http.test.ts
bun run build
```

Expected: HTTP tests pass and route tree includes all coordinator API routes.

- [ ] **Step 6: Commit admin API routes**

```bash
git add src/lib/adoptions src/routes/api/admin/adoptions src/routeTree.gen.ts
git commit -m "feat: add adoption coordinator admin api"
```

---

## Task 5: Public Application Bridge

**Files:**

- Modify: `src/lib/api/submit-application.functions.ts`
- Test: `src/lib/adoptions/caseFactory.test.ts`

- [ ] **Step 1: Extend public submission to create internal case**

After inserting into `adoption_applications`, select the inserted row id:

```ts
const { data: application, error: dbError } = await supabase
  .from("adoption_applications")
  .insert({
    animal_id: data.animal_id ?? null,
    animal_name: data.animal_name,
    animal_type: data.animal_type,
    applicant_name: data.applicant_name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    housing_type: data.housing_type,
    family_size: data.family_size ?? null,
    existing_pets: data.existing_pets ?? null,
    reason: data.reason,
  })
  .select("id")
  .single();
```

Then use a service-role client server-side to create the internal coordinator case. If `SUPABASE_SERVICE_ROLE_KEY` is absent in local dev, throw the same submit failure and log the missing configuration.

- [ ] **Step 2: Create adoption case bridge helper in service**

Add a service method:

```ts
async createCaseFromPublicApplication(args: {
  publicApplicationId: string;
  input: PublicApplicationInput;
}) {
  const caseInput = buildCaseFromPublicApplication({
    ...args.input,
    id: args.publicApplicationId,
  });
  return repo.createCaseFromPublicApplication(caseInput);
}
```

- [ ] **Step 3: Add repository method to upsert supporter/adopter profile and case**

Implement:

```ts
async createCaseFromPublicApplication(input) {
  const newStatus = await getStatusByCategoryAndKey(client, "adoption_case", "new");
  const { data: supporter, error: supporterError } = await client
    .from("supporter")
    .upsert({
      name: input.applicantName,
      email: input.applicantEmail,
      phone: input.applicantPhone,
      language: "zh-HK",
      source: "adoption_form",
    }, { onConflict: "email" })
    .select("id")
    .single();
  if (supporterError) throw supporterError;

  const { error: roleError } = await client.from("supporter_role").upsert({
    supporter_id: supporter.id,
    role: "adopter",
  });
  if (roleError) throw roleError;

  const { data: adopter, error: adopterError } = await client
    .from("adopter_profile")
    .upsert({
      supporter_id: supporter.id,
      address: input.applicantAddress,
      household_size: input.familySize === null ? null : String(input.familySize),
    }, { onConflict: "supporter_id" })
    .select("id")
    .single();
  if (adopterError) throw adopterError;

  const { data: adoptionCase, error: caseError } = await client
    .from("adoption_case")
    .insert({
      public_application_id: input.publicApplicationId,
      status_id: newStatus.id,
      supporter_id: supporter.id,
      adopter_profile_id: adopter.id,
      requested_animal_id: input.requestedAnimalId,
      animal_type: input.animalType,
      applicant_name: input.applicantName,
      applicant_phone: input.applicantPhone,
      applicant_email: input.applicantEmail,
      applicant_address: input.applicantAddress,
      housing_type: input.housingType,
      family_size: input.familySize,
      existing_pets: input.existingPets,
      reason: input.reason,
      preferences: input.preferences,
    })
    .select("id")
    .single();
  if (caseError) throw caseError;
  return { id: adoptionCase.id as string };
}
```

- [ ] **Step 4: Run focused tests**

```bash
bun test src/lib/adoptions
```

Expected: all adoption coordinator tests pass.

- [ ] **Step 5: Commit public bridge**

```bash
git add src/lib/api/submit-application.functions.ts src/lib/adoptions
git commit -m "feat: create coordinator cases from adoption forms"
```

---

## Task 6: Status Admin UI

**Files:**

- Create: `src/components/admin/adoptions/api.ts`
- Create: `src/components/admin/adoptions/StatusAdmin.tsx`
- Create: `src/routes/admin/coordinator/statuses.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify generated: `src/routeTree.gen.ts`

- [ ] **Step 1: Create coordinator admin API helper**

Create `src/components/admin/adoptions/api.ts`:

```ts
import { supabase } from "../../../lib/supabase";

export async function fetchCoordinatorJson<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }
  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Build status admin component**

Create `src/components/admin/adoptions/StatusAdmin.tsx` with React Query fetching `/api/admin/adoptions/statuses`, tabs for categories, table rows for labels/order/flags, and create/edit form. Use `Button`, `Input`, `Switch`, `Select`, and stable row heights. Disable delete for `isSystem`.

- [ ] **Step 3: Add route**

Create `src/routes/admin/coordinator/statuses.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { StatusAdmin } from "../../../components/admin/adoptions/StatusAdmin";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/statuses")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: StatusesPage,
});

function StatusesPage() {
  return (
    <AdminLayout activeSection="applications">
      <StatusAdmin />
    </AdminLayout>
  );
}
```

- [ ] **Step 4: Add admin nav link**

Modify `src/components/admin/AdminLayout.tsx` to add a coordinator statuses link near applications:

```ts
{ section: "applications", label: "申請", to: "/admin/applications" },
{ section: "applications", label: "狀態設定", to: "/admin/coordinator/statuses" },
```

- [ ] **Step 5: Verify UI build**

```bash
bun run lint
bun run build
```

Expected: lint exits 0 with existing warnings only; build succeeds.

- [ ] **Step 6: Commit status admin UI**

```bash
git add src/components/admin src/routes/admin src/routeTree.gen.ts
git commit -m "feat: add coordinator status admin"
```

---

## Task 7: Case List, Detail, Matching, And Finalization UI

**Files:**

- Create: `src/components/admin/adoptions/CaseList.tsx`
- Create: `src/components/admin/adoptions/CaseDetail.tsx`
- Create: `src/components/admin/adoptions/MatchPanel.tsx`
- Create: `src/components/admin/adoptions/FinalizationPanel.tsx`
- Create: `src/routes/admin/applications.tsx`
- Create: `src/routes/admin/applications/$id.tsx`
- Modify: `src/routes/admin/index.tsx`
- Modify generated: `src/routeTree.gen.ts`

- [ ] **Step 1: Move applications out of `/admin?section=applications`**

Keep the old section redirect-compatible. In `src/routes/admin/index.tsx`, when `section === "applications"`, render a link or redirect target to `/admin/applications` rather than maintaining the inline table.

- [ ] **Step 2: Create case list component**

`CaseList.tsx` must fetch `/api/admin/adoptions/cases`, show search/filter controls, status chips, applicant, requested animal, phone, created date, and link to `/admin/applications/$id`.

- [ ] **Step 3: Create case detail component**

`CaseDetail.tsx` must fetch `/api/admin/adoptions/cases/${caseId}` and render sections:

```txt
Applicant
Public submission
Assessment/preference data
Status controls
Matches
Follow-ups
Finalization
Audit/history summary
```

- [ ] **Step 4: Create match panel**

`MatchPanel.tsx` must let staff choose an animal, choose a match status, add notes, and POST to `/api/admin/adoptions/cases/${caseId}/matches`.

- [ ] **Step 5: Create finalization panel**

`FinalizationPanel.tsx` must require a selected approved match, case number, approval date, optional pickup date, optional adoption fee, and POST to `/api/admin/adoptions/cases/${caseId}/finalize`.

- [ ] **Step 6: Add routes**

Create route pages matching:

```tsx
export const Route = createFileRoute("/admin/applications")({ ... });
export const Route = createFileRoute("/admin/applications/$id")({ ... });
```

Both routes must require a Supabase session before loading.

- [ ] **Step 7: Verify**

```bash
bun run lint
bun run build
```

Expected: lint exits 0 with existing warnings only; build succeeds.

- [ ] **Step 8: Commit case workflow UI**

```bash
git add src/components/admin/adoptions src/routes/admin src/routeTree.gen.ts
git commit -m "feat: add adoption coordinator case workflow"
```

---

## Task 8: Animal Pipeline And Internal Profile

**Files:**

- Create: `src/components/admin/adoptions/AnimalPipeline.tsx`
- Create: `src/routes/admin/coordinator/animals.tsx`
- Create: `src/routes/api/admin/adoptions/animals/$id/internal.ts`
- Modify: `src/components/admin/AnimalsTable.tsx`
- Modify generated: `src/routeTree.gen.ts`

- [ ] **Step 1: Add internal animal route handler**

Create route `src/routes/api/admin/adoptions/animals/$id/internal.ts` that verifies `staff/admin`, validates UUID param, accepts internal profile fields, and upserts `animal_profile_internal`.

- [ ] **Step 2: Build animal pipeline UI**

`AnimalPipeline.tsx` must show animals grouped/filterable by lifecycle status, type, adoptable flag, support pool flag, and current position. Include inline actions for lifecycle status and a detail/edit dialog for internal profile fields.

- [ ] **Step 3: Link from existing animal table**

In `AnimalsTable.tsx`, add a small "流程" link to `/admin/coordinator/animals?animalId=${animal.id}`.

- [ ] **Step 4: Verify**

```bash
bun run lint
bun run build
```

Expected: lint exits 0 with existing warnings only; build succeeds.

- [ ] **Step 5: Commit animal pipeline**

```bash
git add src/components/admin src/routes/admin src/routes/api/admin/adoptions src/routeTree.gen.ts
git commit -m "feat: add coordinator animal pipeline"
```

---

## Task 9: Final Verification And PR Prep

**Files:**

- Review: `src/lib/adoptions/**`
- Review: `src/routes/api/admin/adoptions/**`
- Review: `src/components/admin/adoptions/**`
- Review: `src/routes/admin/**`
- Review: `supabase/migrations/*_adoption_coordinator*.sql`

- [ ] **Step 1: Run all tests**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: exit 0. Existing Fast Refresh warnings may remain.

- [ ] **Step 3: Run production build**

```bash
bun run build
```

Expected: Vite/Nitro production build exits 0.

- [ ] **Step 4: Verify migration state**

```bash
supabase db push --linked --dry-run
```

Expected: dry-run shows only the new coordinator migrations if they have not been applied yet, or "Remote database is up to date" after application.

- [ ] **Step 5: Manual smoke checks**

Run `bun run dev`, log in as admin/staff, and verify:

```txt
/admin/coordinator/statuses loads statuses.
Admin can add/edit/reorder a non-system status.
System statuses cannot be deleted or have keys changed.
Submitting /adoption/apply creates public application and internal adoption case.
/admin/applications lists the new case.
Case detail can change status and records history.
Case detail can add a candidate animal match.
Finalization creates successful adoption and closes the case.
Animal pipeline shows internal lifecycle status.
PII API responses have cache-control: no-store.
```

- [ ] **Step 6: Commit final fixes if any**

```bash
git status --short
git add src/lib/adoptions src/components/admin/adoptions src/components/admin/AdminLayout.tsx src/components/admin/AnimalsTable.tsx src/lib/api/submit-application.functions.ts src/routes/admin src/routes/api/admin/adoptions src/routeTree.gen.ts supabase/migrations
git commit -m "fix: polish adoption coordinator workflow"
```

Only run the commit if verification produced follow-up fixes.

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin codex/adoption-coordinator-design
gh pr create --repo YNWAforever/hkscda --base main --head codex/adoption-coordinator-design --title "feat: add adoption coordinator workflow" --body-file -
```

PR body should include:

```markdown
## Summary
- add configurable coordinator statuses
- add adoption case/adopter/match/finalization foundation
- add admin status, case, and animal pipeline screens

## Verification
- `bun run test`
- `bun run lint`
- `bun run build`
- `supabase db push --linked --dry-run`
```
