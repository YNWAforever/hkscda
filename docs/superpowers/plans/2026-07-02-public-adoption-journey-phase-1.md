# Public Adoption Journey Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of the approved public journey: a bilingual multi-animal adoption shortlist, guided adoption wizard, private photo intake, confirmation email with expiring status link, lightweight admin inbox, and richer coordinator case detail.

**Architecture:** Keep `adoption_applications` as the public compatibility summary row, then persist richer questionnaire, ranked animal preferences, visit preferences, private photo metadata, status tokens, and inbox summaries in additive tables. Public browsing state stays client-local through a shortlist provider and local draft storage; submission moves to a multipart API route so photos, Turnstile, rate limiting, persistence, coordinator case creation, and email side effects stay server-controlled. Admin review continues through the coordinator service/repository/API pattern, with a focused inbox read model and expanded case detail.

**Tech Stack:** TypeScript 5, TanStack Start file routes, React 19, TanStack Query, React Hook Form, Zod, Supabase Postgres/Storage, Resend, Bun tests, Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-02-public-adoption-sponsorship-journey-design.md`

**External reference checked:** Supabase changelog, Data API explicit-grant rollout: https://supabase.com/changelog

**Conventions for every task:**
- Type check: `bunx tsc --noEmit` -> Expected: no TypeScript errors.
- Lint: `bun run lint` -> Expected: clean.
- Tests: `bun test` -> Expected: all tests pass.
- Migration changes must include explicit grants plus RLS; do not rely on historic Supabase default table grants.
- Keep sponsorship pledge/proof, model-backed AI FAQ, public account dashboard, real booking slots, and WhatsApp automation out of Phase 1.
- Use Conventional Commits.

---

## File Structure

Create the Phase 1 public adoption package:

- `src/lib/publicAdoption/schemas.ts`: Zod schemas, enums, form payload types, server insert mappers, and photo validation constants.
- `src/lib/publicAdoption/schemas.test.ts`: unit tests for validation, ranking, dates, terms, and payload transforms.
- `src/lib/publicAdoption/shortlist.ts`: pure reducer for local shortlist selection, limits, ranking, and intent exclusivity.
- `src/lib/publicAdoption/shortlist.test.ts`: reducer tests.
- `src/lib/publicAdoption/draft.ts`: local storage serialization for non-file wizard fields.
- `src/lib/publicAdoption/draft.test.ts`: draft tests.
- `src/lib/publicAdoption/statusToken.server.ts`: random token generation, SHA-256 hashing, expiry, lookup, and status summary mapping.
- `src/lib/publicAdoption/statusToken.server.test.ts`: token tests.
- `src/lib/publicAdoption/emailTemplates.server.ts`: bilingual adoption confirmation email rendering.
- `src/lib/publicAdoption/emailTemplates.server.test.ts`: email rendering tests.
- `src/lib/publicAdoption/submission.server.ts`: multipart submission orchestration, storage upload, DB writes, coordinator case bridge, inbox item creation, token creation, and email send.
- `src/lib/publicAdoption/submission.server.test.ts`: persistence and side-effect tests with fake Supabase/Resend clients.

Create public UI components:

- `src/components/site/ShortlistProvider.tsx`: context/provider with local storage persistence and in-memory fallback.
- `src/components/site/ShortlistTray.tsx`: floating bottom tray for selected animals.
- `src/components/site/ShortlistActionButton.tsx`: add/remove action used by cards and detail pages.
- `src/components/site/adoption/ApplicationWizard.tsx`: linear wizard shell, submit handler, Turnstile integration, draft autosave, and review state.
- `src/components/site/adoption/WizardFields.tsx`: reusable field groups for contact, environment, readiness, visit, and review.
- `src/components/site/adoption/PhotoUploader.tsx`: client-side file selection/validation UI; files are submitted with the final multipart request.
- `src/components/site/adoption/GuidancePanel.tsx`: static bilingual guidance text for the current wizard step.
- `src/components/site/adoption/StatusPage.tsx`: public status page rendering for valid/expired/missing token states.

Modify public surfaces:

- `src/routes/__root.tsx`: wrap non-admin pages with `ShortlistProvider` and render `ShortlistTray`.
- `src/components/site/AnimalCard.tsx`: replace direct adoption CTA with shortlist action for cat/dog animals.
- `src/components/site/AnimalDetail.tsx`: replace direct adoption CTA with shortlist action for cat/dog animals; keep sponsor behavior unchanged.
- `src/components/site/AnimalGrid.tsx`: no data shape change; confirm cards receive enough animal data.
- `src/routes/adoption/apply.tsx`: replace the single-animal form with the guided adoption wizard.
- `src/routes/adoption/status.$token.tsx`: new public status route.
- `src/routes/api/adoption/applications.ts`: new public multipart submission API.
- `src/routes/api/adoption/status/$token.ts`: new public status summary API.

Modify admin coordinator surfaces:

- `src/lib/adoptions/types.ts`: add public application detail, animal preference, visit preference, photo, status token, and inbox summary types.
- `src/lib/adoptions/service.ts`: add `listIntakeItems` and include public application detail in case detail.
- `src/lib/adoptions/repository.server.ts`: read new tables for case detail/inbox and return mapped types.
- `src/lib/adoptions/http.server.ts`: add inbox handler.
- `src/routes/api/admin/adoptions/intake/items.ts`: admin inbox API.
- `src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`: admin-gated signed photo URL API.
- `src/components/admin/adoptions/IntakeInbox.tsx`: lightweight lane/SLA inbox.
- `src/components/admin/adoptions/intakeInboxLogic.ts`: pure lane, urgency, and query-param helpers.
- `src/components/admin/adoptions/intakeInboxLogic.test.ts`: inbox helper tests.
- `src/components/admin/adoptions/CaseDetail.tsx`: render questionnaire, ranking, visit preference, photo links, submitted language, terms version, and status-token metadata.
- `src/routes/admin/coordinator/inbox.tsx`: admin inbox page.
- `src/components/admin/adminNav.ts`: add inbox nav item.
- `src/components/admin/adminPageCopy.ts`: add bilingual inbox and public-submission detail copy.

Add one Supabase migration generated by CLI:

- Create with `supabase migration new public_adoption_journey_phase_1`
- The generated file will be named like `supabase/migrations/<timestamp>_public_adoption_journey_phase_1.sql`.

---

### Task 1: Database, Storage, And Migration Safety

**Files:**
- Create: generated `supabase/migrations/<timestamp>_public_adoption_journey_phase_1.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Create the migration file**

Run:

```bash
supabase migration new public_adoption_journey_phase_1
```

Expected: Supabase CLI prints a new migration path ending in `_public_adoption_journey_phase_1.sql`.

- [ ] **Step 2: Add the migration SQL**

Write this SQL into the generated migration file:

```sql
create extension if not exists pgcrypto;

create table if not exists public.adoption_application_detail (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  language text not null check (language in ('zh-HK', 'en')),
  preferred_contact_method text not null check (preferred_contact_method in ('phone', 'whatsapp', 'email')),
  household_size integer check (household_size is null or household_size > 0),
  landlord_restrictions text,
  window_door_safety text not null,
  indoor_space_notes text,
  home_modifications_possible boolean,
  current_pets text,
  pet_care_experience text,
  household_agreement text not null,
  daily_schedule text not null,
  monthly_budget_hkd integer check (monthly_budget_hkd is null or monthly_budget_hkd >= 0),
  emergency_care_plan text not null,
  terms_version text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  questionnaire jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_application_animal_preference (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null references public.adoption_applications(id) on delete cascade,
  rank integer not null check (rank between 1 and 3),
  animal_id uuid references public.animals(id) on delete set null,
  animal_name_snapshot text not null,
  animal_type_snapshot text not null check (animal_type_snapshot in ('cat', 'dog')),
  created_at timestamptz not null default now(),
  unique (public_application_id, rank),
  unique (public_application_id, animal_id)
);

create table if not exists public.adoption_application_visit_preference (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  date_range_start date not null,
  date_range_end date not null,
  preferred_time_windows text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  check (date_range_end >= date_range_start),
  check (array_length(preferred_time_windows, 1) is not null)
);

create table if not exists public.adoption_application_photo (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null references public.adoption_applications(id) on delete cascade,
  storage_bucket text not null default 'adoption-application-photos' check (storage_bucket = 'adoption-application-photos'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  photo_category text not null check (photo_category in ('home', 'window', 'living')),
  uploaded_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.public_status_token (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  entity_type text not null check (entity_type in ('adoption_application')),
  entity_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  check (expires_at > created_at)
);

create table if not exists public.adoption_intake_item (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  adoption_case_id uuid references public.adoption_case(id) on delete set null,
  lane text not null check (lane in ('new_adoption_application', 'visit_followup', 'photos_to_review', 'needs_followup')),
  urgency text not null default 'normal' check (urgency in ('normal', 'high', 'overdue')),
  summary jsonb not null default '{}'::jsonb,
  due_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'adoption_application_detail',
    'adoption_intake_item'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create index if not exists adoption_application_preference_app_rank_idx
  on public.adoption_application_animal_preference (public_application_id, rank);

create index if not exists adoption_application_photo_app_category_idx
  on public.adoption_application_photo (public_application_id, photo_category);

create index if not exists public_status_token_entity_idx
  on public.public_status_token (entity_type, entity_id);

create index if not exists public_status_token_expires_idx
  on public.public_status_token (expires_at)
  where revoked_at is null;

create index if not exists adoption_intake_item_lane_due_idx
  on public.adoption_intake_item (lane, due_at)
  where resolved_at is null;

create index if not exists adoption_intake_item_case_idx
  on public.adoption_intake_item (adoption_case_id);

alter table public.adoption_application_detail enable row level security;
alter table public.adoption_application_animal_preference enable row level security;
alter table public.adoption_application_visit_preference enable row level security;
alter table public.adoption_application_photo enable row level security;
alter table public.public_status_token enable row level security;
alter table public.adoption_intake_item enable row level security;

grant select on public.adoption_application_detail to authenticated;
grant select on public.adoption_application_animal_preference to authenticated;
grant select on public.adoption_application_visit_preference to authenticated;
grant select on public.adoption_application_photo to authenticated;
grant select on public.adoption_intake_item to authenticated;

grant select, insert, update, delete on public.adoption_application_detail to service_role;
grant select, insert, update, delete on public.adoption_application_animal_preference to service_role;
grant select, insert, update, delete on public.adoption_application_visit_preference to service_role;
grant select, insert, update, delete on public.adoption_application_photo to service_role;
grant select, insert, update, delete on public.public_status_token to service_role;
grant select, insert, update, delete on public.adoption_intake_item to service_role;

revoke all on public.adoption_application_detail from anon;
revoke all on public.adoption_application_animal_preference from anon;
revoke all on public.adoption_application_visit_preference from anon;
revoke all on public.adoption_application_photo from anon;
revoke all on public.public_status_token from anon, authenticated;
revoke all on public.adoption_intake_item from anon;

create policy "staff can read public adoption details"
  on public.adoption_application_detail for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption animal preferences"
  on public.adoption_application_animal_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption visit preferences"
  on public.adoption_application_visit_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption photo metadata"
  on public.adoption_application_photo for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read adoption intake items"
  on public.adoption_intake_item for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adoption-application-photos',
  'adoption-application-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "staff can read adoption application photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'adoption-application-photos'
    and private.has_admin_role(array['staff', 'admin'])
  );
```

- [ ] **Step 3: Add migration safety tests**

Modify the top import in `src/lib/supabaseMigrations.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
```

Add this helper below `readMigration`:

```ts
function readMigrationBySuffix(suffix: string) {
  const fileName = readdirSync(join(process.cwd(), "supabase", "migrations")).find((entry) =>
    entry.endsWith(suffix),
  );
  if (!fileName) throw new Error(`Migration not found: ${suffix}`);
  return readMigration(fileName);
}
```

Append this test to `src/lib/supabaseMigrations.test.ts`:

```ts
test("adds public adoption journey detail tables with private storage and explicit grants", () => {
  const sql = readMigrationBySuffix("_public_adoption_journey_phase_1.sql");

  for (const table of [
    "adoption_application_detail",
    "adoption_application_animal_preference",
    "adoption_application_visit_preference",
    "adoption_application_photo",
    "public_status_token",
    "adoption_intake_item",
  ]) {
    expect(sql).toContain(`create table if not exists public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }

  expect(sql).toContain("revoke all on public.public_status_token from anon, authenticated");
  expect(sql).toContain("token_hash text not null unique");
  expect(sql).toContain("adoption-application-photos");
  expect(sql).toContain("public = excluded.public");
  expect(sql).toContain("private.has_admin_role(array['staff', 'admin'])");
  expect(sql).toContain("adoption_intake_item_lane_due_idx");
});
```

- [ ] **Step 4: Verify migration tests fail before filename replacement if skipped**

Run:

```bash
bun test src/lib/supabaseMigrations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
bunx tsc --noEmit && bun run lint && bun test
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/supabaseMigrations.test.ts
git commit -m "feat: add public adoption journey storage schema"
```

---

### Task 2: Public Adoption Schemas And Payload Mappers

**Files:**
- Create: `src/lib/publicAdoption/schemas.ts`
- Create: `src/lib/publicAdoption/schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `src/lib/publicAdoption/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  expandedAdoptionApplicationSchema,
  photoCategorySchema,
  toAdoptionApplicationSummaryInsert,
  toDetailInsert,
  toPreferenceInserts,
  toVisitPreferenceInsert,
  validatePhotoDescriptor,
} from "./schemas";

const applicationId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const catId = "77777777-8888-4333-8444-555555555555";
const dogId = "66666666-8888-4333-8444-555555555555";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "zh-HK",
    animalPreferences: [
      { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
      { rank: 2, animalId: dogId, animalName: "Lucky", animalType: "dog" },
    ],
    contact: {
      applicantName: "Ada",
      phone: "9123 4567",
      email: "ada@example.com",
      address: "HK Island",
      preferredContactMethod: "whatsapp",
      householdSize: 3,
    },
    home: {
      housingType: "私人樓宇",
      landlordRestrictions: "No pet restrictions",
      windowDoorSafety: "All windows have mesh",
      indoorSpaceNotes: "Quiet living room",
      homeModificationsPossible: true,
    },
    readiness: {
      currentPets: "None",
      petCareExperience: "Grew up with cats",
      householdAgreement: "Everyone agrees",
      dailySchedule: "Home evenings and weekends",
      monthlyBudgetHkd: 1200,
      emergencyCarePlan: "Nearby 24-hour vet",
      reason: "I can provide a safe and stable home.",
    },
    visit: {
      dateRangeStart: "2026-07-10",
      dateRangeEnd: "2026-07-24",
      preferredTimeWindows: ["weekday_evening", "weekend_afternoon"],
      notes: "WhatsApp before visiting",
    },
    terms: {
      agreed: true,
      version: "adoption-terms-2026-07",
    },
    sourceMetadata: {
      shortlistSource: "animal_listing",
    },
    ...overrides,
  };
}

describe("expandedAdoptionApplicationSchema", () => {
  test("accepts the full guided adoption payload", () => {
    const parsed = expandedAdoptionApplicationSchema.parse(validPayload());
    expect(parsed.animalPreferences.map((animal) => animal.rank)).toEqual([1, 2]);
    expect(parsed.contact.email).toBe("ada@example.com");
  });

  test("rejects duplicate ranks and more than three animal preferences", () => {
    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
            { rank: 1, animalId: dogId, animalName: "Lucky", animalType: "dog" },
          ],
        }),
      ),
    ).toThrow("Animal preference ranks must be unique");

    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
            { rank: 2, animalId: dogId, animalName: "Lucky", animalType: "dog" },
            { rank: 3, animalId: "55555555-8888-4333-8444-555555555555", animalName: "B", animalType: "cat" },
            { rank: 4, animalId: "44444444-8888-4333-8444-555555555555", animalName: "C", animalType: "dog" },
          ],
        }),
      ),
    ).toThrow();
  });

  test("rejects sponsorship animals and invalid visit ranges in Phase 1", () => {
    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Sponsor Cat", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          visit: {
            dateRangeStart: "2026-08-10",
            dateRangeEnd: "2026-08-01",
            preferredTimeWindows: ["weekend_afternoon"],
            notes: "",
          },
        }),
      ),
    ).toThrow("Visit end date must be on or after the start date");
  });

  test("maps payloads into compatibility and detail inserts", () => {
    const parsed = expandedAdoptionApplicationSchema.parse(validPayload());

    expect(toAdoptionApplicationSummaryInsert(parsed)).toEqual({
      animal_id: catId,
      animal_name: "Mochi",
      animal_type: "cat",
      applicant_name: "Ada",
      phone: "9123 4567",
      email: "ada@example.com",
      address: "HK Island",
      housing_type: "私人樓宇",
      family_size: 3,
      existing_pets: "None",
      reason: "I can provide a safe and stable home.",
    });

    expect(toDetailInsert(applicationId, parsed)).toMatchObject({
      public_application_id: applicationId,
      language: "zh-HK",
      preferred_contact_method: "whatsapp",
      household_size: 3,
      terms_version: "adoption-terms-2026-07",
    });

    expect(toPreferenceInserts(applicationId, parsed)).toHaveLength(2);
    expect(toVisitPreferenceInsert(applicationId, parsed)).toMatchObject({
      public_application_id: applicationId,
      date_range_start: "2026-07-10",
      date_range_end: "2026-07-24",
      preferred_time_windows: ["weekday_evening", "weekend_afternoon"],
    });
  });
});

describe("photo validation", () => {
  test("accepts known categories and image types under 8MB", () => {
    expect(photoCategorySchema.parse("home")).toBe("home");
    expect(
      validatePhotoDescriptor({
        category: "window",
        fileName: "window.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).toEqual({
      category: "window",
      fileName: "window.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
  });

  test("rejects unsupported files", () => {
    expect(() =>
      validatePhotoDescriptor({
        category: "home",
        fileName: "home.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    ).toThrow();
    expect(() =>
      validatePhotoDescriptor({
        category: "living",
        fileName: "large.png",
        mimeType: "image/png",
        sizeBytes: 9 * 1024 * 1024,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/lib/publicAdoption/schemas.test.ts
```

Expected: FAIL because `src/lib/publicAdoption/schemas.ts` does not exist.

- [ ] **Step 3: Add schemas and mappers**

Create `src/lib/publicAdoption/schemas.ts`:

```ts
import { z } from "zod";

export const ADOPTION_TERMS_VERSION = "adoption-terms-2026-07";
export const MAX_ADOPTION_PREFERENCES = 3;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const trimmed = z.string().trim();
const optionalTrimmed = z.string().trim().optional().transform((value) => value || null);

export const languageSchema = z.enum(["zh-HK", "en"]);
export const adoptionAnimalTypeSchema = z.enum(["cat", "dog"]);
export const preferredContactMethodSchema = z.enum(["phone", "whatsapp", "email"]);
export const housingTypeSchema = z.enum(["私人樓宇", "居屋", "公屋", "村屋", "其他"]);
export const visitWindowSchema = z.enum([
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_morning",
  "weekend_afternoon",
]);
export const photoCategorySchema = z.enum(["home", "window", "living"]);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDate = trimmed.refine(isIsoDate, "Invalid date");

export const animalPreferenceSchema = z.object({
  rank: z.number().int().min(1).max(MAX_ADOPTION_PREFERENCES),
  animalId: z.string().uuid(),
  animalName: trimmed.min(1),
  animalType: adoptionAnimalTypeSchema,
});

export const expandedAdoptionApplicationSchema = z
  .object({
    language: languageSchema,
    animalPreferences: z.array(animalPreferenceSchema).min(1).max(MAX_ADOPTION_PREFERENCES),
    contact: z.object({
      applicantName: trimmed.min(1),
      phone: trimmed.min(8),
      email: trimmed.email(),
      address: trimmed.min(5),
      preferredContactMethod: preferredContactMethodSchema,
      householdSize: z.number().int().positive().optional(),
    }),
    home: z.object({
      housingType: housingTypeSchema,
      landlordRestrictions: optionalTrimmed,
      windowDoorSafety: trimmed.min(1),
      indoorSpaceNotes: optionalTrimmed,
      homeModificationsPossible: z.boolean().nullable().optional().transform((value) => value ?? null),
    }),
    readiness: z.object({
      currentPets: optionalTrimmed,
      petCareExperience: optionalTrimmed,
      householdAgreement: trimmed.min(1),
      dailySchedule: trimmed.min(1),
      monthlyBudgetHkd: z.number().int().min(0).optional(),
      emergencyCarePlan: trimmed.min(1),
      reason: trimmed.min(10),
    }),
    visit: z.object({
      dateRangeStart: isoDate,
      dateRangeEnd: isoDate,
      preferredTimeWindows: z.array(visitWindowSchema).min(1),
      notes: optionalTrimmed,
    }),
    terms: z.object({
      agreed: z.literal(true),
      version: z.string().min(1).default(ADOPTION_TERMS_VERSION),
    }),
    sourceMetadata: z.record(z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    const ranks = new Set(value.animalPreferences.map((animal) => animal.rank));
    if (ranks.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Animal preference ranks must be unique",
      });
    }

    const animalIds = new Set(value.animalPreferences.map((animal) => animal.animalId));
    if (animalIds.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Each animal can only appear once",
      });
    }

    if (value.visit.dateRangeEnd < value.visit.dateRangeStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visit", "dateRangeEnd"],
        message: "Visit end date must be on or after the start date",
      });
    }
  })
  .transform((value) => ({
    ...value,
    animalPreferences: [...value.animalPreferences].sort((left, right) => left.rank - right.rank),
  }));

export type ExpandedAdoptionApplication = z.infer<typeof expandedAdoptionApplicationSchema>;
export type AdoptionPhotoCategory = z.infer<typeof photoCategorySchema>;

export type AdoptionPhotoDescriptor = {
  category: AdoptionPhotoCategory;
  fileName: string;
  mimeType: (typeof PHOTO_MIME_TYPES)[number];
  sizeBytes: number;
};

export function validatePhotoDescriptor(input: {
  category: unknown;
  fileName: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}): AdoptionPhotoDescriptor {
  return z
    .object({
      category: photoCategorySchema,
      fileName: trimmed.min(1).max(180),
      mimeType: z.enum(PHOTO_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
    })
    .parse(input);
}

export function toAdoptionApplicationSummaryInsert(input: ExpandedAdoptionApplication) {
  const firstAnimal = input.animalPreferences[0]!;
  return {
    animal_id: firstAnimal.animalId,
    animal_name: firstAnimal.animalName,
    animal_type: firstAnimal.animalType,
    applicant_name: input.contact.applicantName,
    phone: input.contact.phone,
    email: input.contact.email,
    address: input.contact.address,
    housing_type: input.home.housingType,
    family_size: input.contact.householdSize ?? null,
    existing_pets: input.readiness.currentPets,
    reason: input.readiness.reason,
  };
}

export function toDetailInsert(publicApplicationId: string, input: ExpandedAdoptionApplication) {
  return {
    public_application_id: publicApplicationId,
    language: input.language,
    preferred_contact_method: input.contact.preferredContactMethod,
    household_size: input.contact.householdSize ?? null,
    landlord_restrictions: input.home.landlordRestrictions,
    window_door_safety: input.home.windowDoorSafety,
    indoor_space_notes: input.home.indoorSpaceNotes,
    home_modifications_possible: input.home.homeModificationsPossible,
    current_pets: input.readiness.currentPets,
    pet_care_experience: input.readiness.petCareExperience,
    household_agreement: input.readiness.householdAgreement,
    daily_schedule: input.readiness.dailySchedule,
    monthly_budget_hkd: input.readiness.monthlyBudgetHkd ?? null,
    emergency_care_plan: input.readiness.emergencyCarePlan,
    terms_version: input.terms.version,
    source_metadata: input.sourceMetadata,
    questionnaire: {
      contact: input.contact,
      home: input.home,
      readiness: input.readiness,
    },
  };
}

export function toPreferenceInserts(publicApplicationId: string, input: ExpandedAdoptionApplication) {
  return input.animalPreferences.map((animal) => ({
    public_application_id: publicApplicationId,
    rank: animal.rank,
    animal_id: animal.animalId,
    animal_name_snapshot: animal.animalName,
    animal_type_snapshot: animal.animalType,
  }));
}

export function toVisitPreferenceInsert(publicApplicationId: string, input: ExpandedAdoptionApplication) {
  return {
    public_application_id: publicApplicationId,
    date_range_start: input.visit.dateRangeStart,
    date_range_end: input.visit.dateRangeEnd,
    preferred_time_windows: input.visit.preferredTimeWindows,
    notes: input.visit.notes,
  };
}
```

- [ ] **Step 4: Verify tests pass**

Run:

```bash
bun test src/lib/publicAdoption/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
bunx tsc --noEmit && bun run lint && bun test
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/publicAdoption/schemas.ts src/lib/publicAdoption/schemas.test.ts
git commit -m "feat: add public adoption payload schemas"
```

---

### Task 3: Shortlist Reducer, Provider, And Floating Tray

**Files:**
- Create: `src/lib/publicAdoption/shortlist.ts`
- Create: `src/lib/publicAdoption/shortlist.test.ts`
- Create: `src/components/site/ShortlistProvider.tsx`
- Create: `src/components/site/ShortlistTray.tsx`
- Create: `src/components/site/ShortlistActionButton.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/components/site/AnimalCard.tsx`
- Modify: `src/components/site/AnimalDetail.tsx`

- [ ] **Step 1: Write failing shortlist tests**

Create `src/lib/publicAdoption/shortlist.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { addShortlistItem, removeShortlistItem, reorderAdoptionItems } from "./shortlist";
import type { ShortlistItem } from "./shortlist";

const baseAnimal = {
  id: "77777777-8888-4333-8444-555555555555",
  name: "Mochi",
  animalType: "cat" as const,
  imageUrl: null,
};

function item(id: string, rank: number): ShortlistItem {
  return {
    id,
    name: `Animal ${rank}`,
    animalType: "cat",
    imageUrl: null,
    intent: "adoption",
    rank,
  };
}

describe("shortlist reducer helpers", () => {
  test("adds adoption animals with the next rank", () => {
    const result = addShortlistItem([], { ...baseAnimal, intent: "adoption" });
    expect(result.items).toEqual([{ ...baseAnimal, intent: "adoption", rank: 1 }]);
    expect(result.message).toBeNull();
  });

  test("enforces adoption limit of three", () => {
    const result = addShortlistItem(
      [item("a", 1), item("b", 2), item("c", 3)],
      { ...baseAnimal, id: "d", intent: "adoption" },
    );
    expect(result.items).toHaveLength(3);
    expect(result.message).toBe("最多可選擇 3 隻領養動物。");
  });

  test("does not allow the same animal under two intents", () => {
    const result = addShortlistItem(
      [{ ...baseAnimal, intent: "adoption", rank: 1 }],
      { ...baseAnimal, intent: "sponsorship" },
    );
    expect(result.items).toHaveLength(1);
    expect(result.message).toBe("此動物已在清單內，請先移除再轉換意向。");
  });

  test("removes an item and compacts adoption ranks", () => {
    expect(removeShortlistItem([item("a", 1), item("b", 2), item("c", 3)], "b")).toEqual([
      item("a", 1),
      item("c", 2),
    ]);
  });

  test("reorders adoption ranks", () => {
    expect(reorderAdoptionItems([item("a", 1), item("b", 2), item("c", 3)], ["c", "a", "b"])).toEqual([
      item("c", 1),
      item("a", 2),
      item("b", 3),
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/lib/publicAdoption/shortlist.test.ts
```

Expected: FAIL because `shortlist.ts` does not exist.

- [ ] **Step 3: Add pure shortlist logic**

Create `src/lib/publicAdoption/shortlist.ts`:

```ts
export type ShortlistIntent = "adoption" | "sponsorship";
export type ShortlistAnimalType = "cat" | "dog" | "sponsor";

export type ShortlistItem = {
  id: string;
  name: string;
  animalType: ShortlistAnimalType;
  imageUrl: string | null;
  intent: ShortlistIntent;
  rank: number;
};

export type AddShortlistInput = Omit<ShortlistItem, "rank">;
export type ShortlistResult = { items: ShortlistItem[]; message: string | null };

export const ADOPTION_LIMIT = 3;
export const SPONSORSHIP_LIMIT = 10;
export const SHORTLIST_STORAGE_KEY = "hkscda-public-shortlist-v1";

function compactRanks(items: ShortlistItem[]) {
  const adoptionItems = items
    .filter((item) => item.intent === "adoption")
    .sort((left, right) => left.rank - right.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const sponsorshipItems = items
    .filter((item) => item.intent === "sponsorship")
    .sort((left, right) => left.rank - right.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return [...adoptionItems, ...sponsorshipItems];
}

export function addShortlistItem(items: ShortlistItem[], input: AddShortlistInput): ShortlistResult {
  const existing = items.find((item) => item.id === input.id);
  if (existing) {
    return {
      items,
      message:
        existing.intent === input.intent
          ? "此動物已在清單內。"
          : "此動物已在清單內，請先移除再轉換意向。",
    };
  }

  const currentIntentCount = items.filter((item) => item.intent === input.intent).length;
  const limit = input.intent === "adoption" ? ADOPTION_LIMIT : SPONSORSHIP_LIMIT;
  if (currentIntentCount >= limit) {
    return {
      items,
      message:
        input.intent === "adoption"
          ? "最多可選擇 3 隻領養動物。"
          : "最多可選擇 10 隻助養動物。",
    };
  }

  return {
    items: compactRanks([...items, { ...input, rank: currentIntentCount + 1 }]),
    message: null,
  };
}

export function removeShortlistItem(items: ShortlistItem[], animalId: string) {
  return compactRanks(items.filter((item) => item.id !== animalId));
}

export function reorderAdoptionItems(items: ShortlistItem[], orderedIds: string[]) {
  const adoptionById = new Map(
    items.filter((item) => item.intent === "adoption").map((item) => [item.id, item]),
  );
  const orderedAdoption = orderedIds
    .map((id) => adoptionById.get(id))
    .filter((item): item is ShortlistItem => Boolean(item))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const untouchedAdoption = [...adoptionById.values()].filter((item) => !orderedIds.includes(item.id));
  const sponsorship = items.filter((item) => item.intent === "sponsorship");
  return compactRanks([...orderedAdoption, ...untouchedAdoption, ...sponsorship]);
}

export function serializeShortlist(items: ShortlistItem[]) {
  return JSON.stringify(compactRanks(items));
}

export function parseShortlist(value: string | null): ShortlistItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return compactRanks(
      parsed.filter(
        (item): item is ShortlistItem =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          ["cat", "dog", "sponsor"].includes(item.animalType) &&
          ["adoption", "sponsorship"].includes(item.intent) &&
          typeof item.rank === "number",
      ),
    );
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Verify reducer tests pass**

Run:

```bash
bun test src/lib/publicAdoption/shortlist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add provider and tray components**

Create `src/components/site/ShortlistProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  SHORTLIST_STORAGE_KEY,
  addShortlistItem,
  parseShortlist,
  removeShortlistItem,
  reorderAdoptionItems,
  serializeShortlist,
  type AddShortlistInput,
  type ShortlistItem,
} from "../../lib/publicAdoption/shortlist";

type ShortlistContextValue = {
  items: ShortlistItem[];
  persistenceWarning: string | null;
  message: string | null;
  addItem: (item: AddShortlistInput) => void;
  removeItem: (animalId: string) => void;
  clearMessage: () => void;
  clear: () => void;
  reorderAdoptions: (animalIds: string[]) => void;
  findItem: (animalId: string) => ShortlistItem | undefined;
};

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);

  useEffect(() => {
    try {
      setItems(parseShortlist(window.localStorage.getItem(SHORTLIST_STORAGE_KEY)));
    } catch {
      setPersistenceWarning("瀏覽器未能儲存清單；本次瀏覽仍可繼續選擇。");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHORTLIST_STORAGE_KEY, serializeShortlist(items));
    } catch {
      setPersistenceWarning("瀏覽器未能儲存清單；本次瀏覽仍可繼續選擇。");
    }
  }, [items]);

  const value = useMemo<ShortlistContextValue>(
    () => ({
      items,
      persistenceWarning,
      message,
      addItem(input) {
        setItems((current) => {
          const result = addShortlistItem(current, input);
          setMessage(result.message);
          return result.items;
        });
      },
      removeItem(animalId) {
        setItems((current) => removeShortlistItem(current, animalId));
      },
      clearMessage() {
        setMessage(null);
      },
      clear() {
        setItems([]);
      },
      reorderAdoptions(animalIds) {
        setItems((current) => reorderAdoptionItems(current, animalIds));
      },
      findItem(animalId) {
        return items.find((item) => item.id === animalId);
      },
    }),
    [items, message, persistenceWarning],
  );

  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlist() {
  const value = useContext(ShortlistContext);
  if (!value) throw new Error("useShortlist must be used inside ShortlistProvider");
  return value;
}
```

Create `src/components/site/ShortlistTray.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";

import { useShortlist } from "./ShortlistProvider";

export function ShortlistTray() {
  const { items, message, persistenceWarning, clearMessage, removeItem } = useShortlist();
  const adoptionItems = items.filter((item) => item.intent === "adoption");
  const sponsorshipItems = items.filter((item) => item.intent === "sponsorship");

  if (items.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-panel"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Heart className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-panel)]">
              已選 {items.length} 隻：領養 {adoptionItems.length}，助養 {sponsorshipItems.length}
            </p>
            {(message || persistenceWarning) && (
              <p className="text-xs text-[var(--color-text-muted)]">{message ?? persistenceWarning}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adoptionItems.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => removeItem(item.id)}
              className="inline-flex max-w-32 items-center gap-1 rounded-full bg-[var(--color-surface-offset)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
              title={`移除 ${item.name}`}
            >
              <span className="truncate">{item.rank}. {item.name}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {message && (
            <button
              type="button"
              onClick={clearMessage}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
            >
              關閉提示
            </button>
          )}
          {adoptionItems.length > 0 && (
            <Link to="/adoption/apply" className="btn-cta py-2! px-4! text-xs!">
              申請領養
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
```

Create `src/components/site/ShortlistActionButton.tsx`:

```tsx
import { Check, Plus } from "lucide-react";

import type { Animal } from "../../types/animal";
import { useShortlist } from "./ShortlistProvider";

export function ShortlistActionButton({ animal, compact = false }: { animal: Animal; compact?: boolean }) {
  const { addItem, findItem, removeItem } = useShortlist();
  const selected = findItem(animal.id);
  const isAdoptionAnimal = animal.type === "cat" || animal.type === "dog";

  if (!isAdoptionAnimal) {
    return null;
  }

  if (selected) {
    return (
      <button
        type="button"
        onClick={() => removeItem(animal.id)}
        className={compact ? "btn-outline mt-auto text-xs! py-1.5! px-3!" : "btn-outline py-3!"}
      >
        <Check className="h-4 w-4" />
        已加入，按此移除
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          id: animal.id,
          name: animal.name,
          animalType: animal.type,
          imageUrl: animal.image_url,
          intent: "adoption",
        })
      }
      className={compact ? "btn-cta mt-auto text-xs! py-1.5! px-3!" : "btn-cta py-3!"}
    >
      <Plus className="h-4 w-4" />
      加入領養清單
    </button>
  );
}
```

- [ ] **Step 6: Wire provider and animal CTAs**

Modify `src/routes/__root.tsx`:

```tsx
import { ShortlistProvider } from "../components/site/ShortlistProvider";
import { ShortlistTray } from "../components/site/ShortlistTray";
```

Wrap the non-admin public shell inside `RootComponent`:

```tsx
  const publicContent = (
    <>
      <Header />
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <Footer />
      <ShortlistTray />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <div id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      ) : (
        <ShortlistProvider>{publicContent}</ShortlistProvider>
      )}
    </QueryClientProvider>
  );
```

Modify `src/components/site/AnimalCard.tsx`:

```tsx
import { ShortlistActionButton } from "./ShortlistActionButton";
```

Replace the CTA link with:

```tsx
        {animal.type === "sponsor" ? (
          <Link to={detailHref} className="btn-cta mt-auto text-xs! py-1.5! px-3!">
            立即助養 <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <ShortlistActionButton animal={animal} compact />
        )}
```

Modify `src/components/site/AnimalDetail.tsx`:

```tsx
import { ShortlistActionButton } from "./ShortlistActionButton";
```

Replace the adoption `applyHref` CTA block with:

```tsx
          <div className="flex flex-col gap-2 pt-2">
            {animal.type === "sponsor" ? (
              <Link to="/sponsors" className="btn-cta py-3!">
                查看助養付款方式
              </Link>
            ) : (
              <ShortlistActionButton animal={animal} />
            )}
          </div>
```

- [ ] **Step 7: Verify public UI compiles**

Run:

```bash
bunx tsc --noEmit && bun test src/lib/publicAdoption/shortlist.test.ts && bun run lint
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/publicAdoption/shortlist.ts src/lib/publicAdoption/shortlist.test.ts src/components/site/ShortlistProvider.tsx src/components/site/ShortlistTray.tsx src/components/site/ShortlistActionButton.tsx src/routes/__root.tsx src/components/site/AnimalCard.tsx src/components/site/AnimalDetail.tsx
git commit -m "feat: add public adoption shortlist"
```

---

### Task 4: Local Draft Storage And Guided Wizard UI

**Files:**
- Create: `src/lib/publicAdoption/draft.ts`
- Create: `src/lib/publicAdoption/draft.test.ts`
- Create: `src/components/site/adoption/ApplicationWizard.tsx`
- Create: `src/components/site/adoption/WizardFields.tsx`
- Create: `src/components/site/adoption/PhotoUploader.tsx`
- Create: `src/components/site/adoption/GuidancePanel.tsx`
- Modify: `src/routes/adoption/apply.tsx`

- [ ] **Step 1: Write failing draft tests**

Create `src/lib/publicAdoption/draft.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { ADOPTION_DRAFT_STORAGE_KEY, parseDraft, serializeDraft } from "./draft";

describe("adoption draft storage", () => {
  test("uses a stable storage key", () => {
    expect(ADOPTION_DRAFT_STORAGE_KEY).toBe("hkscda-adoption-application-draft-v1");
  });

  test("round-trips non-file fields", () => {
    const draft = {
      language: "en",
      contact: { applicantName: "Ada", email: "ada@example.com" },
      photos: [{ name: "must-not-persist.jpg" }],
    };
    const parsed = parseDraft(serializeDraft(draft));
    expect(parsed).toEqual({
      language: "en",
      contact: { applicantName: "Ada", email: "ada@example.com" },
    });
  });

  test("returns an empty object for corrupt JSON", () => {
    expect(parseDraft("{broken")).toEqual({});
  });
});
```

- [ ] **Step 2: Add draft storage helpers**

Create `src/lib/publicAdoption/draft.ts`:

```ts
export const ADOPTION_DRAFT_STORAGE_KEY = "hkscda-adoption-application-draft-v1";

function stripFiles(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item instanceof File))
      .map(stripFiles);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => key !== "photos" && !(item instanceof File))
        .map(([key, item]) => [key, stripFiles(item)]),
    );
  }
  return value;
}

export function serializeDraft(value: unknown) {
  return JSON.stringify(stripFiles(value));
}

export function parseDraft(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 3: Verify draft tests pass**

Run:

```bash
bun test src/lib/publicAdoption/draft.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add the guided wizard components**

Implement `ApplicationWizard` as a seven-step linear wizard using the existing `TurnstileWidget`, `useShortlist`, and the schema from Task 2. The component must:

- Initialize ranked adoption preferences from shortlist items with `intent === "adoption"`.
- Redirect users back to `/animals/cat` or show an empty-state link when no adoption animals are selected.
- Save non-file form state to `ADOPTION_DRAFT_STORAGE_KEY` after every step.
- Remind users that photos are not preserved by draft autosave.
- Submit `FormData` to `/api/adoption/applications` with `payload` JSON and photo fields named `photo:${category}`.
- Clear the shortlist and local draft only after the API returns `{ applicationId, reference, statusUrl }`.

Use this submit helper inside `ApplicationWizard.tsx`:

```tsx
async function submitAdoptionApplication(payload: unknown, photos: SelectedPhoto[], turnstileToken: string | null) {
  const body = new FormData();
  body.set("payload", JSON.stringify({ ...payload, turnstileToken: turnstileToken ?? undefined }));
  for (const photo of photos) {
    body.append(`photo:${photo.category}`, photo.file, photo.file.name);
  }

  const response = await fetch("/api/adoption/applications", {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "提交失敗，請稍後再試。");
  }
  return result as { applicationId: string; reference: string; statusUrl: string };
}
```

Use this step definition in `ApplicationWizard.tsx`:

```tsx
const WIZARD_STEPS = [
  { id: "animals", zh: "動物排序", en: "Animal ranking" },
  { id: "contact", zh: "聯絡及家庭", en: "Contact and household" },
  { id: "home", zh: "家居環境", en: "Home environment" },
  { id: "readiness", zh: "照顧準備", en: "Care readiness" },
  { id: "visit", zh: "探望偏好", en: "Visit preferences" },
  { id: "photos", zh: "環境相片", en: "Photos" },
  { id: "review", zh: "檢查提交", en: "Review" },
] as const;
```

Implement `PhotoUploader.tsx` with this selected photo type and client validation:

```tsx
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, photoCategorySchema, type AdoptionPhotoCategory } from "../../../lib/publicAdoption/schemas";

export type SelectedPhoto = {
  id: string;
  category: AdoptionPhotoCategory;
  file: File;
};

export function validateSelectedFile(category: string, file: File) {
  const parsedCategory = photoCategorySchema.parse(category);
  if (!PHOTO_MIME_TYPES.includes(file.type as (typeof PHOTO_MIME_TYPES)[number])) {
    return { ok: false as const, message: "只接受 JPG、PNG 或 WebP 圖片。" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false as const, message: "每張相片不可超過 8MB。" };
  }
  return { ok: true as const, photo: { id: `${parsedCategory}:${file.name}:${file.size}`, category: parsedCategory, file } };
}
```

Implement `GuidancePanel.tsx` with static bilingual copy for each step. The copy must explain why the field is requested and include a privacy reminder on the photo step. The AI guide is represented only by this static content in Phase 1.

- [ ] **Step 5: Replace `/adoption/apply`**

Replace `src/routes/adoption/apply.tsx` with a thin route shell:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { ApplicationWizard } from "../../components/site/adoption/ApplicationWizard";

export const Route = createFileRoute("/adoption/apply")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/adoption/apply" }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return <ApplicationWizard />;
}
```

- [ ] **Step 6: Verify UI compiles**

Run:

```bash
bunx tsc --noEmit && bun test src/lib/publicAdoption/draft.test.ts src/lib/publicAdoption/schemas.test.ts && bun run lint
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/publicAdoption/draft.ts src/lib/publicAdoption/draft.test.ts src/components/site/adoption src/routes/adoption/apply.tsx
git commit -m "feat: add guided adoption application wizard"
```

---

### Task 5: Multipart Submission, Private Photos, Status Tokens, And Email

**Files:**
- Create: `src/lib/publicAdoption/statusToken.server.ts`
- Create: `src/lib/publicAdoption/statusToken.server.test.ts`
- Create: `src/lib/publicAdoption/emailTemplates.server.ts`
- Create: `src/lib/publicAdoption/emailTemplates.server.test.ts`
- Create: `src/lib/publicAdoption/submission.server.ts`
- Create: `src/lib/publicAdoption/submission.server.test.ts`
- Create: `src/routes/api/adoption/applications.ts`
- Modify: `src/lib/adoptions/caseFactory.ts`
- Modify: `src/lib/adoptions/service.ts`
- Modify: `src/lib/adoptions/repository.server.ts`
- Modify: existing adoptions tests that assert `createCaseFromPublicApplication`

- [ ] **Step 1: Write token tests**

Create `src/lib/publicAdoption/statusToken.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createStatusTokenPair, hashStatusToken, isTokenExpired } from "./statusToken.server";

describe("status tokens", () => {
  test("creates a long raw token and stores only the hash", () => {
    const pair = createStatusTokenPair(() => Buffer.alloc(32, 7));
    expect(pair.rawToken).toHaveLength(43);
    expect(pair.tokenHash).toBe(hashStatusToken(pair.rawToken));
    expect(pair.tokenHash).not.toBe(pair.rawToken);
  });

  test("classifies expired tokens", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    expect(isTokenExpired("2026-07-01T23:59:59.000Z", now)).toBe(true);
    expect(isTokenExpired("2026-07-03T00:00:00.000Z", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Add token helpers**

Create `src/lib/publicAdoption/statusToken.server.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export const STATUS_TOKEN_DAYS = 30;

export function hashStatusToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createStatusTokenPair(random = randomBytes) {
  const rawToken = random(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashStatusToken(rawToken),
  };
}

export function statusTokenExpiry(now = () => new Date()) {
  const expiresAt = now();
  expiresAt.setDate(expiresAt.getDate() + STATUS_TOKEN_DAYS);
  return expiresAt.toISOString();
}

export function isTokenExpired(expiresAt: string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}
```

- [ ] **Step 3: Add bilingual email template tests and renderer**

Create `src/lib/publicAdoption/emailTemplates.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { renderAdoptionConfirmationEmail } from "./emailTemplates.server";

describe("renderAdoptionConfirmationEmail", () => {
  test("renders Traditional Chinese confirmation with status link", () => {
    const email = renderAdoptionConfirmationEmail({
      language: "zh-HK",
      applicantName: "Ada",
      reference: "APP-ABC123",
      statusUrl: "https://example.test/adoption/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(email.subject).toBe("HKSCDA 已收到您的領養申請 APP-ABC123");
    expect(email.html).toContain("Ada");
    expect(email.html).toContain("https://example.test/adoption/status/token");
  });

  test("renders English confirmation", () => {
    const email = renderAdoptionConfirmationEmail({
      language: "en",
      applicantName: "Ada",
      reference: "APP-ABC123",
      statusUrl: "https://example.test/adoption/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(email.subject).toBe("HKSCDA received your adoption application APP-ABC123");
    expect(email.html).toContain("Your status link expires on 2026-08-01");
  });
});
```

Create `src/lib/publicAdoption/emailTemplates.server.ts`:

```ts
import type { ExpandedAdoptionApplication } from "./schemas";

type EmailInput = {
  language: ExpandedAdoptionApplication["language"];
  applicantName: string;
  reference: string;
  statusUrl: string;
  expiresAt: string;
};

function dateOnly(value: string) {
  return value.slice(0, 10);
}

export function renderAdoptionConfirmationEmail(input: EmailInput) {
  if (input.language === "en") {
    return {
      subject: `HKSCDA received your adoption application ${input.reference}`,
      html: `<p>Dear ${input.applicantName},</p><p>Thank you for applying to adopt through HKSCDA. We have received your application <strong>${input.reference}</strong>.</p><p>You can review the submitted summary and preparation checklist here: <a href="${input.statusUrl}">${input.statusUrl}</a></p><p>Your status link expires on ${dateOnly(input.expiresAt)}.</p><p>Our team will contact you to arrange the next steps. Uploaded photos are kept private and are not shown on the public status page.</p>`,
    };
  }

  return {
    subject: `HKSCDA 已收到您的領養申請 ${input.reference}`,
    html: `<p>${input.applicantName} 您好：</p><p>多謝您提交 HKSCDA 領養申請。我們已收到申請 <strong>${input.reference}</strong>。</p><p>您可透過以下連結查看提交摘要及準備清單：<a href="${input.statusUrl}">${input.statusUrl}</a></p><p>此狀態連結將於 ${dateOnly(input.expiresAt)} 到期。</p><p>義工會再聯絡您安排下一步。上載相片只供職員審核，不會顯示於公開狀態頁。</p>`,
  };
}
```

- [ ] **Step 4: Update coordinator case bridge to preserve ranked preferences**

Modify `src/lib/adoptions/caseFactory.ts` so `PublicApplicationInput` accepts `preferences?: Record<string, unknown>` and `buildCaseFromPublicApplication` merges it:

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
  preferences?: Record<string, unknown>;
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
      ...(input.preferences ?? {}),
    },
  };
}
```

- [ ] **Step 5: Implement submission orchestration**

Create `src/lib/publicAdoption/submission.server.ts` with these exported seams:

```ts
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { getAppUrl, getEmailConfig } from "../donations/config.server";
import { renderAdoptionConfirmationEmail } from "./emailTemplates.server";
import {
  expandedAdoptionApplicationSchema,
  toAdoptionApplicationSummaryInsert,
  toDetailInsert,
  toPreferenceInserts,
  toVisitPreferenceInsert,
  validatePhotoDescriptor,
  type AdoptionPhotoCategory,
  type ExpandedAdoptionApplication,
} from "./schemas";
import { createStatusTokenPair, statusTokenExpiry } from "./statusToken.server";

type CoordinatorCaseService = {
  createCaseFromPublicApplication(args: {
    publicApplicationId: string;
    input: ReturnType<typeof toAdoptionApplicationSummaryInsert> & {
      preferences?: Record<string, unknown>;
    };
  }): Promise<{ id: string } | unknown>;
};

export type ParsedAdoptionMultipart = {
  payload: ExpandedAdoptionApplication & { turnstileToken?: string };
  photos: Array<{ category: AdoptionPhotoCategory; file: File }>;
};

export async function parseAdoptionMultipart(request: Request): Promise<ParsedAdoptionMultipart> {
  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") throw new Error("Missing application payload");

  const parsedJson = JSON.parse(rawPayload) as Record<string, unknown>;
  const { turnstileToken, ...payloadInput } = parsedJson;
  const payload = expandedAdoptionApplicationSchema.parse(payloadInput) as ExpandedAdoptionApplication & {
    turnstileToken?: string;
  };
  if (typeof turnstileToken === "string") payload.turnstileToken = turnstileToken;

  const photos: ParsedAdoptionMultipart["photos"] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("photo:")) continue;
    if (!(value instanceof File)) continue;
    const category = key.slice("photo:".length);
    validatePhotoDescriptor({
      category,
      fileName: value.name,
      mimeType: value.type,
      sizeBytes: value.size,
    });
    photos.push({ category: category as AdoptionPhotoCategory, file: value });
  }

  if (photos.length === 0) throw new Error("Please upload at least one home or window photo");
  if (photos.length > 6) throw new Error("Please upload no more than 6 photos");
  return { payload, photos };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function applicationReference(id: string) {
  return `APP-${id.slice(0, 8).toUpperCase()}`;
}

export async function persistPublicAdoptionJourney({
  client,
  payload,
  photos,
  createCoordinatorService,
  createCoordinatorRepository,
  now = () => new Date(),
}: {
  client: SupabaseClient;
  payload: ExpandedAdoptionApplication;
  photos: ParsedAdoptionMultipart["photos"];
  createCoordinatorRepository: (client: SupabaseClient) => unknown;
  createCoordinatorService: (args: { repo: unknown }) => CoordinatorCaseService;
  now?: () => Date;
}) {
  const uploadedPaths: string[] = [];
  let applicationId: string | null = null;

  try {
    const summaryInsert = toAdoptionApplicationSummaryInsert(payload);
    const { data: application, error: applicationError } = await client
      .from("adoption_applications")
      .insert(summaryInsert)
      .select("id")
      .single();
    if (applicationError || !application?.id) throw applicationError ?? new Error("Missing application id");
    applicationId = application.id as string;

    for (const photo of photos) {
      const descriptor = validatePhotoDescriptor({
        category: photo.category,
        fileName: photo.file.name,
        mimeType: photo.file.type,
        sizeBytes: photo.file.size,
      });
      const path = `${applicationId}/${randomUUID()}-${safeFileName(descriptor.fileName)}`;
      const { error: uploadError } = await client.storage
        .from("adoption-application-photos")
        .upload(path, await photo.file.arrayBuffer(), {
          contentType: descriptor.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);

      const { error: photoError } = await client.from("adoption_application_photo").insert({
        public_application_id: applicationId,
        storage_path: path,
        file_name: descriptor.fileName,
        mime_type: descriptor.mimeType,
        size_bytes: descriptor.sizeBytes,
        photo_category: descriptor.category,
      });
      if (photoError) throw photoError;
    }

    const detailRows = [
      client.from("adoption_application_detail").insert(toDetailInsert(applicationId, payload)),
      client.from("adoption_application_animal_preference").insert(toPreferenceInserts(applicationId, payload)),
      client.from("adoption_application_visit_preference").insert(toVisitPreferenceInsert(applicationId, payload)),
    ];
    for (const operation of detailRows) {
      const { error } = await operation;
      if (error) throw error;
    }

    const coordinatorService = createCoordinatorService({ repo: createCoordinatorRepository(client) });
    const caseResult = await coordinatorService.createCaseFromPublicApplication({
      publicApplicationId: applicationId,
      input: {
        ...summaryInsert,
        preferences: {
          rankedAnimals: payload.animalPreferences,
          visit: payload.visit,
          language: payload.language,
        },
      },
    });

    const dueAt = new Date(now().getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await client.from("adoption_intake_item").insert({
      public_application_id: applicationId,
      adoption_case_id: (caseResult as { id: string }).id,
      lane: "new_adoption_application",
      urgency: "normal",
      due_at: dueAt,
      summary: {
        applicantName: payload.contact.applicantName,
        rankedAnimals: payload.animalPreferences,
        visit: payload.visit,
        photoCount: photos.length,
      },
    });

    const tokenPair = createStatusTokenPair();
    const expiresAt = statusTokenExpiry(now);
    await client.from("public_status_token").insert({
      token_hash: tokenPair.tokenHash,
      entity_type: "adoption_application",
      entity_id: applicationId,
      expires_at: expiresAt,
    });

    return {
      applicationId,
      caseId: (caseResult as { id: string }).id,
      reference: applicationReference(applicationId),
      statusToken: tokenPair.rawToken,
      statusUrl: `${getAppUrl()}/adoption/status/${tokenPair.rawToken}`,
      expiresAt,
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await client.storage.from("adoption-application-photos").remove(uploadedPaths);
    }
    if (applicationId) {
      await client.from("adoption_applications").delete().eq("id", applicationId);
    }
    throw error;
  }
}

export async function sendAdoptionConfirmationEmail(
  client: SupabaseClient,
  payload: ExpandedAdoptionApplication,
  result: { applicationId: string; reference: string; statusUrl: string; expiresAt: string },
) {
  const config = getEmailConfig();
  const rendered = renderAdoptionConfirmationEmail({
    language: payload.language,
    applicantName: payload.contact.applicantName,
    reference: result.reference,
    statusUrl: result.statusUrl,
    expiresAt: result.expiresAt,
  });

  const { data: caseRow } = await client
    .from("adoption_case")
    .select("supporter_id")
    .eq("public_application_id", result.applicationId)
    .maybeSingle();
  const supporterId = (caseRow as { supporter_id?: string | null } | null)?.supporter_id;

  let messageId: string | null = null;
  if (supporterId) {
    const { data: message } = await client
      .from("message")
      .insert({
        supporter_id: supporterId,
        channel: "email",
        status: "queued",
        payload: {
          kind: "adoption_application_confirmation",
          applicationId: result.applicationId,
          reference: result.reference,
          subject: rendered.subject,
        },
      })
      .select("id")
      .single();
    messageId = (message as { id?: string } | null)?.id ?? null;
  }

  if (!config.resendApiKey) return "queued" as const;

  try {
    await new Resend(config.resendApiKey).emails.send({
      from: config.from,
      replyTo: config.replyTo,
      to: payload.contact.email,
      subject: rendered.subject,
      html: rendered.html,
    });
    if (messageId) {
      await client.from("message").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", messageId);
    }
    return "sent" as const;
  } catch (error) {
    console.error("Failed to send adoption confirmation email", error);
    if (messageId) await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed" as const;
  }
}
```

- [ ] **Step 6: Add public API route**

Create `src/routes/api/adoption/applications.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createSupabaseAdoptionCoordinatorRepository } from "../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../lib/adoptions/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { parseAdoptionMultipart, persistPublicAdoptionJourney, sendAdoptionConfirmationEmail } from "../../../lib/publicAdoption/submission.server";
import { getClientIp, enforceRateLimit, retryAfterSeconds } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function submitApplication({ request }: { request: Request }) {
  try {
    const ip = getClientIp(request);
    const limit = await enforceRateLimit(ip, { prefix: "adoption", max: 5, window: "1 m" });
    if (!limit.ok) {
      return jsonResponse(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
      );
    }

    const { payload, photos } = await parseAdoptionMultipart(request);
    if (!(await verifyTurnstile(payload.turnstileToken, ip))) {
      return jsonResponse({ error: "Verification failed" }, { status: 400 });
    }

    const client = createSupabaseServiceClient();
    const result = await persistPublicAdoptionJourney({
      client,
      payload,
      photos,
      createCoordinatorRepository: createSupabaseAdoptionCoordinatorRepository,
      createCoordinatorService: createAdoptionCoordinatorService,
    });

    await sendAdoptionConfirmationEmail(client, payload, result);

    return jsonResponse(
      {
        applicationId: result.applicationId,
        reference: result.reference,
        statusUrl: result.statusUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid application payload", issues: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid application payload" }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Please upload")) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return jsonResponse({ error: "Could not save adoption application" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/adoption/applications")({
  server: {
    handlers: {
      POST: ({ request }) => submitApplication({ request }),
    },
  },
});
```

- [ ] **Step 7: Verify tests and compile**

Run:

```bash
bun test src/lib/publicAdoption/statusToken.server.test.ts src/lib/publicAdoption/emailTemplates.server.test.ts src/lib/publicAdoption/submission.server.test.ts src/lib/adoptions/caseFactory.test.ts src/lib/adoptions/repository.server.test.ts src/lib/adoptions/service.test.ts
bunx tsc --noEmit
bun run lint
```

Expected: all commands pass after updating existing test expectations for ranked preferences.

- [ ] **Step 8: Commit**

```bash
git add src/lib/publicAdoption src/routes/api/adoption/applications.ts src/lib/adoptions/caseFactory.ts src/lib/adoptions/service.ts src/lib/adoptions/repository.server.ts src/lib/adoptions/*.test.ts
git commit -m "feat: persist guided adoption applications"
```

---

### Task 6: Public Magic-Link Status Page

**Files:**
- Create: `src/routes/api/adoption/status/$token.ts`
- Create: `src/routes/adoption/status.$token.tsx`
- Create: `src/components/site/adoption/StatusPage.tsx`
- Modify: `src/lib/publicAdoption/statusToken.server.ts`
- Modify: `src/lib/publicAdoption/statusToken.server.test.ts`

- [ ] **Step 1: Extend token tests for status lookup**

Add tests to `src/lib/publicAdoption/statusToken.server.test.ts` for these outcomes:

```ts
test("maps a valid status row to a public-safe summary", () => {
  const summary = buildPublicStatusSummary({
    application: {
      id: "app-1",
      created_at: "2026-07-02T01:00:00.000Z",
      applicant_name: "Ada",
      email: "ada@example.com",
      phone: "9123 4567",
    },
    preferences: [{ rank: 1, animal_name_snapshot: "Mochi", animal_type_snapshot: "cat" }],
    visit: {
      date_range_start: "2026-07-10",
      date_range_end: "2026-07-24",
      preferred_time_windows: ["weekend_afternoon"],
      notes: "Call first",
    },
    token: {
      expires_at: "2026-08-01T00:00:00.000Z",
    },
  });

  expect(summary).toEqual({
    reference: "APP-APP-1",
    submittedAt: "2026-07-02T01:00:00.000Z",
    applicantName: "Ada",
    contactSummary: "ada@example.com · 9123 4567",
    rankedAnimals: [{ rank: 1, name: "Mochi", type: "cat" }],
    visitPreference: {
      dateRangeStart: "2026-07-10",
      dateRangeEnd: "2026-07-24",
      preferredTimeWindows: ["weekend_afternoon"],
      notes: "Call first",
    },
    expiresAt: "2026-08-01T00:00:00.000Z",
  });
});
```

- [ ] **Step 2: Add status summary mapper**

Extend `src/lib/publicAdoption/statusToken.server.ts`:

```ts
export function applicationReference(id: string) {
  return `APP-${id.slice(0, 8).toUpperCase()}`;
}

export function buildPublicStatusSummary(input: {
  application: {
    id: string;
    created_at: string;
    applicant_name: string;
    email: string;
    phone: string;
  };
  preferences: Array<{ rank: number; animal_name_snapshot: string; animal_type_snapshot: string }>;
  visit: {
    date_range_start: string;
    date_range_end: string;
    preferred_time_windows: string[];
    notes: string | null;
  } | null;
  token: { expires_at: string };
}) {
  return {
    reference: applicationReference(input.application.id),
    submittedAt: input.application.created_at,
    applicantName: input.application.applicant_name,
    contactSummary: [input.application.email, input.application.phone].filter(Boolean).join(" · "),
    rankedAnimals: input.preferences
      .sort((left, right) => left.rank - right.rank)
      .map((preference) => ({
        rank: preference.rank,
        name: preference.animal_name_snapshot,
        type: preference.animal_type_snapshot,
      })),
    visitPreference: input.visit
      ? {
          dateRangeStart: input.visit.date_range_start,
          dateRangeEnd: input.visit.date_range_end,
          preferredTimeWindows: input.visit.preferred_time_windows,
          notes: input.visit.notes,
        }
      : null,
    expiresAt: input.token.expires_at,
  };
}
```

- [ ] **Step 3: Add status API route**

Create `src/routes/api/adoption/status/$token.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import { buildPublicStatusSummary, hashStatusToken, isTokenExpired } from "../../../../lib/publicAdoption/statusToken.server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function getStatus({ params }: { params: { token: string } }) {
  const client = createSupabaseServiceClient();
  const tokenHash = hashStatusToken(params.token);
  const { data: token, error: tokenError } = await client
    .from("public_status_token")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("entity_type", "adoption_application")
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!token) return jsonResponse({ error: "Status link not found" }, { status: 404 });
  if (token.revoked_at || isTokenExpired(token.expires_at)) {
    return jsonResponse({ error: "Status link expired" }, { status: 410 });
  }

  await client.from("public_status_token").update({ last_viewed_at: new Date().toISOString() }).eq("id", token.id);

  const [applicationResult, preferenceResult, visitResult] = await Promise.all([
    client
      .from("adoption_applications")
      .select("id,created_at,applicant_name,email,phone")
      .eq("id", token.entity_id)
      .single(),
    client
      .from("adoption_application_animal_preference")
      .select("rank,animal_name_snapshot,animal_type_snapshot")
      .eq("public_application_id", token.entity_id)
      .order("rank", { ascending: true }),
    client
      .from("adoption_application_visit_preference")
      .select("date_range_start,date_range_end,preferred_time_windows,notes")
      .eq("public_application_id", token.entity_id)
      .maybeSingle(),
  ]);

  if (applicationResult.error) throw applicationResult.error;
  if (preferenceResult.error) throw preferenceResult.error;
  if (visitResult.error) throw visitResult.error;

  return jsonResponse({
    status: buildPublicStatusSummary({
      application: applicationResult.data,
      preferences: preferenceResult.data ?? [],
      visit: visitResult.data ?? null,
      token,
    }),
  });
}

export const Route = createFileRoute("/api/adoption/status/$token")({
  server: {
    handlers: {
      GET: ({ params }) => getStatus({ params }),
    },
  },
});
```

- [ ] **Step 4: Add status page route and component**

Create `src/components/site/adoption/StatusPage.tsx` that fetches `/api/adoption/status/${token}` with React Query and renders:

- Valid state: reference, submitted date, ranked animals, contact summary, visit preference, next-step checklist, HKSCDA fallback contact.
- Expired state: plain-language expiry message and mailto link to request a new link.
- Missing state: link back to adoption animals.

Create `src/routes/adoption/status.$token.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { StatusPage } from "../../components/site/adoption/StatusPage";

export const Route = createFileRoute("/adoption/status/$token")({
  component: AdoptionStatusRoute,
});

function AdoptionStatusRoute() {
  const { token } = Route.useParams();
  return <StatusPage token={token} />;
}
```

- [ ] **Step 5: Verify**

Run:

```bash
bun test src/lib/publicAdoption/statusToken.server.test.ts
bunx tsc --noEmit
bun run lint
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/publicAdoption/statusToken.server.ts src/lib/publicAdoption/statusToken.server.test.ts src/routes/api/adoption/status src/routes/adoption/status.$token.tsx src/components/site/adoption/StatusPage.tsx
git commit -m "feat: add adoption status magic link page"
```

---

### Task 7: Admin Intake Inbox, Case Detail, And Photo Links

**Files:**
- Create: `src/components/admin/adoptions/intakeInboxLogic.ts`
- Create: `src/components/admin/adoptions/intakeInboxLogic.test.ts`
- Create: `src/components/admin/adoptions/IntakeInbox.tsx`
- Create: `src/routes/admin/coordinator/inbox.tsx`
- Create: `src/routes/api/admin/adoptions/intake/items.ts`
- Create: `src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`
- Modify: `src/lib/adoptions/types.ts`
- Modify: `src/lib/adoptions/service.ts`
- Modify: `src/lib/adoptions/repository.server.ts`
- Modify: `src/lib/adoptions/http.server.ts`
- Modify: `src/components/admin/adoptions/CaseDetail.tsx`
- Modify: `src/components/admin/adminNav.ts`
- Modify: `src/components/admin/adminPageCopy.ts`

- [ ] **Step 1: Write inbox helper tests**

Create `src/components/admin/adoptions/intakeInboxLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildIntakeSearchParams, intakeUrgencyLabel } from "./intakeInboxLogic";

describe("intake inbox logic", () => {
  test("builds lane query params", () => {
    expect(buildIntakeSearchParams({ lane: "photos_to_review", openOnly: true }).toString()).toBe(
      "lane=photos_to_review&openOnly=true",
    );
  });

  test("labels urgency", () => {
    expect(intakeUrgencyLabel("normal", "zh")).toBe("普通");
    expect(intakeUrgencyLabel("high", "en")).toBe("High");
    expect(intakeUrgencyLabel("overdue", "zh")).toBe("逾期");
  });
});
```

- [ ] **Step 2: Add admin types**

Extend `src/lib/adoptions/types.ts`:

```ts
export type PublicAdoptionAnimalPreference = {
  id: string;
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
  animalTypeSnapshot: "cat" | "dog";
};

export type PublicAdoptionVisitPreference = {
  dateRangeStart: string;
  dateRangeEnd: string;
  preferredTimeWindows: string[];
  notes: string | null;
};

export type PublicAdoptionPhoto = {
  id: string;
  publicApplicationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  photoCategory: "home" | "window" | "living";
  uploadedAt: string;
};

export type PublicAdoptionDetail = {
  language: "zh-HK" | "en";
  preferredContactMethod: "phone" | "whatsapp" | "email";
  termsVersion: string;
  questionnaire: Record<string, unknown>;
  animalPreferences: PublicAdoptionAnimalPreference[];
  visitPreference: PublicAdoptionVisitPreference | null;
  photos: PublicAdoptionPhoto[];
  statusToken: {
    expiresAt: string;
    revokedAt: string | null;
    lastViewedAt: string | null;
  } | null;
};

export type AdoptionIntakeLane =
  | "new_adoption_application"
  | "visit_followup"
  | "photos_to_review"
  | "needs_followup";

export type AdoptionIntakeUrgency = "normal" | "high" | "overdue";

export type AdoptionIntakeItem = {
  id: string;
  publicApplicationId: string;
  adoptionCaseId: string | null;
  lane: AdoptionIntakeLane;
  urgency: AdoptionIntakeUrgency;
  dueAt: string;
  createdAt: string;
  resolvedAt: string | null;
  summary: {
    applicantName?: string;
    rankedAnimals?: Array<{ rank: number; animalName: string; animalType: string }>;
    visit?: Record<string, unknown>;
    photoCount?: number;
  };
};
```

Then add `publicAdoption: PublicAdoptionDetail | null` to `AdoptionCaseDetail`.

- [ ] **Step 3: Extend service and repository**

Add to `AdoptionCoordinatorRepository`:

```ts
listIntakeItems(input: { lane?: AdoptionIntakeLane; openOnly: boolean }): Promise<{ items: AdoptionIntakeItem[] }>;
```

Add to `createAdoptionCoordinatorService`:

```ts
listIntakeItems(rawSearch: unknown) {
  const input = z
    .object({
      lane: z.enum(["new_adoption_application", "visit_followup", "photos_to_review", "needs_followup"]).optional(),
      openOnly: z
        .union([z.literal("true"), z.literal("false"), z.boolean()])
        .optional()
        .transform((value) => value === undefined ? true : value === true || value === "true"),
    })
    .parse(rawSearch);
  return repo.listIntakeItems(input);
},
```

In `repository.server.ts`, implement:

```ts
async function loadPublicAdoptionDetail(client: SupabaseClient, publicApplicationId: string | null) {
  if (!publicApplicationId) return null;
  const [detailResult, preferencesResult, visitResult, photosResult, tokenResult] = await Promise.all([
    client.from("adoption_application_detail").select("*").eq("public_application_id", publicApplicationId).maybeSingle(),
    client.from("adoption_application_animal_preference").select("*").eq("public_application_id", publicApplicationId).order("rank", { ascending: true }),
    client.from("adoption_application_visit_preference").select("*").eq("public_application_id", publicApplicationId).maybeSingle(),
    client.from("adoption_application_photo").select("*").eq("public_application_id", publicApplicationId).order("uploaded_at", { ascending: false }),
    client.from("public_status_token").select("expires_at,revoked_at,last_viewed_at").eq("entity_type", "adoption_application").eq("entity_id", publicApplicationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (detailResult.error) throw detailResult.error;
  if (preferencesResult.error) throw preferencesResult.error;
  if (visitResult.error) throw visitResult.error;
  if (photosResult.error) throw photosResult.error;
  if (tokenResult.error) throw tokenResult.error;
  if (!detailResult.data) return null;

  return {
    language: detailResult.data.language,
    preferredContactMethod: detailResult.data.preferred_contact_method,
    termsVersion: detailResult.data.terms_version,
    questionnaire: detailResult.data.questionnaire ?? {},
    animalPreferences: (preferencesResult.data ?? []).map((row) => ({
      id: row.id,
      rank: row.rank,
      animalId: row.animal_id,
      animalNameSnapshot: row.animal_name_snapshot,
      animalTypeSnapshot: row.animal_type_snapshot,
    })),
    visitPreference: visitResult.data
      ? {
          dateRangeStart: visitResult.data.date_range_start,
          dateRangeEnd: visitResult.data.date_range_end,
          preferredTimeWindows: visitResult.data.preferred_time_windows ?? [],
          notes: visitResult.data.notes,
        }
      : null,
    photos: (photosResult.data ?? []).map((row) => ({
      id: row.id,
      publicApplicationId: row.public_application_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      photoCategory: row.photo_category,
      uploadedAt: row.uploaded_at,
    })),
    statusToken: tokenResult.data
      ? {
          expiresAt: tokenResult.data.expires_at,
          revokedAt: tokenResult.data.revoked_at,
          lastViewedAt: tokenResult.data.last_viewed_at,
        }
      : null,
  };
}
```

Call it from `getCaseDetail` and include `publicAdoption` in the returned detail.

- [ ] **Step 4: Add inbox API and UI**

Add handler to `http.server.ts`:

```ts
listIntakeItems({ request }: HandlerContext) {
  return withErrors(async () => {
    await requireCoordinator(request);
    const search = Object.fromEntries(new URL(request.url).searchParams);
    return jsonResponse(await service.listIntakeItems(search));
  });
},
```

Create `src/routes/api/admin/adoptions/intake/items.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/intake/items")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listIntakeItems({ request }),
    },
  },
});
```

Create `src/routes/admin/coordinator/inbox.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { IntakeInbox } from "../../../components/admin/adoptions/IntakeInbox";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/inbox")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorInboxPage,
});

function CoordinatorInboxPage() {
  return (
    <AdminLayout activeSection="applications">
      <IntakeInbox />
    </AdminLayout>
  );
}
```

- [ ] **Step 5: Add admin photo signed URL route**

Create `src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createSupabaseServiceClient, requireAdmin } from "../../../../../../../lib/donations/supabase.server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function getPhotoUrl({ request, params }: { request: Request; params: { applicationId: string; photoId: string } }) {
  const applicationId = z.string().uuid().parse(params.applicationId);
  const photoId = z.string().uuid().parse(params.photoId);
  const client = createSupabaseServiceClient();
  await requireAdmin(request, ["staff", "admin"], client);

  const { data: photo, error } = await client
    .from("adoption_application_photo")
    .select("storage_bucket,storage_path,file_name")
    .eq("public_application_id", applicationId)
    .eq("id", photoId)
    .maybeSingle();
  if (error) throw error;
  if (!photo) return jsonResponse({ error: "Photo not found" }, { status: 404 });

  const { data: signed, error: signedError } = await client.storage
    .from(photo.storage_bucket)
    .createSignedUrl(photo.storage_path, 60, { download: photo.file_name });
  if (signedError) throw signedError;
  return jsonResponse({ url: signed.signedUrl });
}

export const Route = createFileRoute("/api/admin/adoptions/applications/$applicationId/photos/$photoId")({
  server: {
    handlers: {
      GET: ({ request, params }) => getPhotoUrl({ request, params }),
    },
  },
});
```

- [ ] **Step 6: Render case detail additions**

In `CaseDetail.tsx`, add sections after the current public submission section:

- Ranked animal preferences.
- Visit preferences.
- Questionnaire grouped by `contact`, `home`, and `readiness`.
- Photo list with buttons that fetch the signed URL route and open it in a new tab.
- Status link metadata: expiry, revoked state, last viewed.

Use no-store admin API routes only; do not put raw storage paths into image `src` attributes.

- [ ] **Step 7: Verify admin tests and compile**

Run:

```bash
bun test src/components/admin/adoptions/intakeInboxLogic.test.ts src/lib/adoptions/repository.server.test.ts src/lib/adoptions/service.test.ts src/lib/adoptions/http.test.ts
bunx tsc --noEmit
bun run lint
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/adoptions src/routes/api/admin/adoptions src/routes/admin/coordinator/inbox.tsx src/components/admin/adoptions src/components/admin/adminNav.ts src/components/admin/adminPageCopy.ts
git commit -m "feat: add adoption intake inbox and rich case detail"
```

---

### Task 8: End-To-End Verification And Phase Boundary Check

**Files:**
- Modify only files required by fixes found during verification.

- [ ] **Step 1: Run automated verification**

Run:

```bash
bunx tsc --noEmit
bun run lint
bun test
```

Expected: all commands pass.

- [ ] **Step 2: Run local dev server**

Run:

```bash
bun run dev
```

Expected: Vite starts and prints a local URL.

- [ ] **Step 3: Manual public verification**

In the browser:

```text
1. Open /animals/cat.
2. Add three adoption animals to the shortlist.
3. Try adding a fourth adoption animal and confirm the friendly max-3 message.
4. Remove one animal and confirm ranks compact.
5. Open /adoption/apply.
6. Complete the wizard in Traditional Chinese.
7. Upload one home/window/living image under 8MB.
8. Submit with Turnstile disabled in local dev or a valid token in configured environments.
9. Confirm success view shows an application reference and status link.
10. Open the status link and confirm photos are not visible.
```

Expected: the full flow completes without losing draft text fields, and the status page shows only the public-safe summary.

- [ ] **Step 4: Manual English verification**

In the browser:

```text
1. Open /adoption/apply with an adoption shortlist.
2. Switch language to English in the wizard.
3. Confirm every step label, guidance panel, validation message, and confirmation copy is readable in English.
4. Submit a second application.
5. Confirm the email subject would use the English template when RESEND_API_KEY is configured.
```

Expected: no Traditional Chinese-only labels remain in the English wizard path except animal names/data from the source database.

- [ ] **Step 5: Manual admin verification**

In the browser:

```text
1. Log in as staff/admin.
2. Open /admin/coordinator/inbox.
3. Confirm the new application appears with applicant name, ranked animals, visit summary, photo count, due/SLA indicator, and a deep link.
4. Open the linked case detail.
5. Confirm questionnaire, ranked animals, visit preference, language, terms version, status-token metadata, and photo links render.
6. Open a photo link and confirm the URL is signed and expires rather than exposing a public bucket URL.
```

Expected: staff can review Phase 1 public details; unauthenticated users cannot access admin APIs or photo signed URLs.

- [ ] **Step 6: Phase boundary scan**

Run:

```bash
rg -n "sponsorship_pledge|sponsorship_payment_proof|AI assistant|openai|whatsapp|booking slot|subscription" src supabase/migrations
```

Expected: no Phase 2/3/4 implementation appears in `src` or migrations. Static guidance text may mention an assistant concept only as non-model help text.

- [ ] **Step 7: Final commit if verification fixes were needed**

If Step 1-6 required changes, commit them:

```bash
git add src supabase/migrations
git commit -m "fix: complete public adoption journey verification"
```

Expected: no uncommitted implementation files remain except user-owned unrelated files.

---

## Self-Review Notes

- Spec coverage: Phase 1 public adoption shortlist, ranked multi-animal wizard, photo upload, local draft autosave, Turnstile/rate limit, confirmation email, expiring status page, admin inbox summary, and rich coordinator detail are mapped to Tasks 1-8.
- Phase boundary: Sponsorship pledge/proof, model-backed AI FAQ, account dashboard, recurring billing, WhatsApp automation, and real booking slots are explicitly excluded from implementation tasks.
- Security: All sensitive tables are service-role writes, RLS is enabled, public status tokens are hashed, photos are private, and admin photo access uses short signed URLs behind role-gated no-store APIs.
