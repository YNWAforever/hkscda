# Rescue and Adoption Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen rescue-story publication, add medical-donation calls to action, collect species-specific visit windows, and publish CMS-managed adoption fees, estates, and post-adoption guides.

**Architecture:** Keep rescue stories on the existing `content_item.status` lifecycle and add no duplicate publication flag. Extend the public-adoption domain compatibly, then add an adoption-information domain backed by Supabase and PR 1's shared document registry. Route loaders supply public data; admin APIs retain service/repository/HTTP boundaries and bounded pagination.

**Tech Stack:** TanStack Start, React 19, TypeScript, Zod, Tailwind CSS, Supabase Postgres/Storage, Bun test, Vite, Playwright

## Global Constraints

- Start after PR 1 merges and rebase onto that merge.
- Map the brief's `/adopt` behavior onto existing routes: form at `/adoption/apply`, information at `/adoption/instructions`; do not add an alias.
- `content_item.status = 'published'` remains the only story publication source of truth.
- Preserve old submissions through deterministic grouped-window fallbacks.
- Reuse PR 1's two guide assets; never duplicate Storage objects or CMS rows.
- Preserve exact fee values, disclaimers, adult-cat sentence, and CTA copy.
- Write a failing test before each production change and commit each task separately.

---

## Task 1: Add the Adoption Information Schema

**Files:**

- Create: `supabase/migrations/20260718110000_adoption_information.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Add a failing migration test**

```ts
test("adds grouped visits and adoption information", () => {
  const sql = readMigration("20260718110000_adoption_information.sql");
  expect(sql).toContain("add column if not exists dog_time_windows text[]");
  expect(sql).toContain("add column if not exists cat_time_windows text[]");
  expect(sql).toContain("create table if not exists public.adoption_fees");
  expect(sql).toContain("create table if not exists public.dog_friendly_estates");
  expect(sql).toContain("Typical Species 一般品種");
  expect(sql).toContain("Big Cage Rental");
  expect(sql).toContain("revoke all on public.adoption_fees from anon, authenticated");
});
```

- [ ] **Step 2: Run it and confirm the missing-migration failure**

```bash
bun test src/lib/supabaseMigrations.test.ts
```

- [ ] **Step 3: Implement the migration**

Add nullable `dog_time_windows text[]` and `cat_time_windows text[]` to `adoption_application_visit_preference`; retain `preferred_time_windows`. Create `adoption_fees` with `animal_type in ('dog','cat')`, text prices, non-negative sort order, publication state, timestamps, and unique `(animal_type, sort_order)`. Seed exactly the six dog and eight cat rows in the approved order using idempotent upserts.

Create `dog_friendly_estates` with the approved columns and index `(is_published, sort_order, estate_name)`. Apply the repository-standard `updated_at` trigger. Enable RLS, grant CRUD only to `service_role`, and revoke `anon, authenticated` access; reads go through server repositories.

- [ ] **Step 4: Run the migration test and commit**

```bash
bun test src/lib/supabaseMigrations.test.ts
git add supabase/migrations/20260718110000_adoption_information.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add adoption information schema"
```

---

## Task 2: Normalize Species-Specific Visit Windows

**Files:**

- Create: `src/lib/publicAdoption/visitWindows.ts`
- Create: `src/lib/publicAdoption/visitWindows.test.ts`
- Modify: `src/lib/publicAdoption/schemas.ts`
- Modify: `src/lib/publicAdoption/schemas.test.ts`
- Modify: `src/lib/publicAdoption/submission.server.ts`
- Modify: `src/lib/publicAdoption/submission.server.test.ts`

- [ ] **Step 1: Write failing normalization tests**

```ts
expect(
  normalizeVisitWindows(["dog"], {
    dog: ["weekday_afternoon"],
    cat: ["weekday_morning"],
  }),
).toEqual({ dog: ["weekday_afternoon"], cat: [] });

expect(
  readVisitWindows(
    {
      dog_time_windows: null,
      cat_time_windows: null,
      preferred_time_windows: ["weekday_afternoon"],
    },
    ["dog", "cat"],
  ),
).toEqual({
  dog: ["weekday_afternoon"],
  cat: ["weekday_afternoon"],
});
```

Add schema and insert-mapper cases for dog, cat, both, invalid values, grouped columns, and legacy union output.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
bun test src/lib/publicAdoption/visitWindows.test.ts src/lib/publicAdoption/schemas.test.ts src/lib/publicAdoption/submission.server.test.ts
```

- [ ] **Step 3: Implement typed options and helpers**

```ts
export const DOG_VISIT_WINDOWS = ["weekday_afternoon", "weekend_afternoon"] as const;

export const CAT_VISIT_WINDOWS = [
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_morning",
  "weekend_afternoon",
] as const;
```

Export `normalizeVisitWindows(species, windows)` and `readVisitWindows(row, species)`. Deduplicate in option order. Legacy values map only to selected species and only when valid for that species.

Replace the new client payload's combined array with `dogTimeWindows` and `catTimeWindows`. Use `superRefine` to require a valid selection for every selected species and reject values for unselected species. New inserts write grouped columns plus a stable union to the legacy column during compatibility.

- [ ] **Step 4: Run tests and commit**

```bash
bun test src/lib/publicAdoption/visitWindows.test.ts src/lib/publicAdoption/schemas.test.ts src/lib/publicAdoption/submission.server.test.ts
git add src/lib/publicAdoption
git commit -m "feat: group adoption visit windows by species"
```

---

## Task 3: Render Dynamic Visit Controls

**Files:**

- Modify: `src/components/site/adoption/ApplicationWizard.tsx`
- Modify: `src/components/site/adoption/ApplicationWizard.test.tsx`
- Modify: `src/components/site/adoption/WizardFields.tsx`
- Modify: `src/components/site/adoption/WizardFields.test.tsx`
- Modify: `src/routes/adoption/apply.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover dog-only, cat-only, both labelled groups, species-change pruning, draft restoration, and inline errors. Assert all bilingual labels from the spec.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/components/site/adoption/ApplicationWizard.test.tsx src/components/site/adoption/WizardFields.test.tsx
```

- [ ] **Step 3: Implement stable grouped controls**

Render `狗舍參觀時間` and `貓舍參觀時間` fieldsets only for selected species. Use checkboxes because multiple windows are allowed. Normalize through `normalizeVisitWindows` on species updates and draft restoration, never during render.

- [ ] **Step 4: Test and commit**

```bash
bun test src/components/site/adoption/ApplicationWizard.test.tsx src/components/site/adoption/WizardFields.test.tsx
git add src/components/site/adoption src/routes/adoption/apply.tsx
git commit -m "feat: add species-specific visit controls"
```

---

## Task 4: Build the Adoption Information Domain and Admin API

**Files:**

- Create: `src/lib/adoptionInformation/types.ts`
- Create: `src/lib/adoptionInformation/schemas.ts`
- Create: `src/lib/adoptionInformation/schemas.test.ts`
- Create: `src/lib/adoptionInformation/service.ts`
- Create: `src/lib/adoptionInformation/service.test.ts`
- Create: `src/lib/adoptionInformation/repository.server.ts`
- Create: `src/lib/adoptionInformation/repository.server.test.ts`
- Create: `src/lib/adoptionInformation/http.ts`
- Create: `src/routes/api/admin/adoption-information.ts`
- Create: `src/routes/api/admin/adoption-information.test.ts`

- [ ] **Step 1: Write failing contract, repository, and API tests**

Cover bounded pages, trimmed fields, allowed species, stable order, empty estates, staff/admin authorization, safe conflicts, exact selected columns, and database-level publication filters.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/adoptionInformation src/routes/api/admin/adoption-information.test.ts
```

- [ ] **Step 3: Implement interfaces and schemas**

```ts
export interface AdoptionInformationRepository {
  listPublic(): Promise<{
    fees: AdoptionFee[];
    estates: DogFriendlyEstate[];
  }>;
  listAdmin(input: AdminAdoptionInformationQuery): Promise<AdminAdoptionInformationPage>;
  upsertFee(input: AdoptionFeeInput): Promise<AdoptionFee>;
  upsertEstate(input: EstateInput): Promise<DogFriendlyEstate>;
  deleteEstate(id: string): Promise<void>;
}
```

Public queries select display columns only, filter `is_published = true` in SQL, and discard unpublished mapped rows defensively. Admin `pageSize` is capped at 50; escape `%`, `_`, and backslash before `ilike`.

- [ ] **Step 4: Add authenticated handlers**

Follow `requireAdmin`, `fetchAdminJson`, request-ID, method schema, safe-error, and audit-log conventions. Audit create/update/delete/publish actions.

- [ ] **Step 5: Test and commit**

```bash
bun test src/lib/adoptionInformation src/routes/api/admin/adoption-information.test.ts
git add src/lib/adoptionInformation src/routes/api/admin/adoption-information.ts src/routes/api/admin/adoption-information.test.ts
git commit -m "feat: add adoption information service"
```

---

## Task 5: Add the Adoption Information Admin Surface

**Files:**

- Create: `src/routes/admin/content/adoption.tsx`
- Create: `src/routes/admin/content/adoption.test.tsx`
- Create: `src/components/admin/content/AdoptionInformationManagement.tsx`
- Create: `src/components/admin/content/AdoptionInformationManagement.test.tsx`
- Modify: `src/components/admin/content/ContentManagement.tsx`
- Modify: `src/components/admin/adminNav.ts`

- [ ] **Step 1: Write failing UI tests**

Cover text-preserving fee edits, estate create/edit/publish/delete, loading/error/empty states, bounded search, and mutation cache invalidation.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/routes/admin/content/adoption.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx
```

- [ ] **Step 3: Implement the management UI**

Use tabs for `領養費用` and `可養狗屋苑`. Keep sections unframed, use existing icons/dialogs, preserve `price_hkd` as text, and reorder fees only within species.

- [ ] **Step 4: Test and commit**

```bash
bun test src/routes/admin/content/adoption.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx
git add src/routes/admin/content/adoption.tsx src/routes/admin/content/adoption.test.tsx src/components/admin/content/AdoptionInformationManagement.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx src/components/admin/content/ContentManagement.tsx src/components/admin/adminNav.ts
git commit -m "feat: add adoption information admin"
```

---

## Task 6: Harden Stories and Add Medical CTAs

**Files:**

- Modify: `src/lib/content/contentListRead.server.ts`
- Modify: `src/lib/content/contentListRead.server.test.ts`
- Modify: `src/lib/content/publicStoriesPage.server.ts`
- Modify: `src/lib/content/publicStoriesPage.server.test.ts`
- Modify: `src/components/site/stories/StoryWall.tsx`
- Modify: `src/components/site/stories/StoryWall.test.tsx`
- Modify: `src/components/site/stories/StoryDetail.tsx`
- Modify: `src/components/site/stories/StoryDetail.test.tsx`
- Modify: `src/routes/stories.tsx`
- Modify: `src/routes/stories.test.tsx`
- Modify: `src/routes/stories/$slug.tsx`

- [ ] **Step 1: Write failing publication and CTA tests**

Assert repository `status = 'published'`, mapper rejection of leaked drafts, not-found detail for drafts, `救援個案` headings/metadata, and every card/detail CTA linking to `/donate?purpose=medical` with `支援醫療費用 ｜ 立即捐助`.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/content/contentListRead.server.test.ts src/lib/content/publicStoriesPage.server.test.ts src/components/site/stories/StoryWall.test.tsx src/components/site/stories/StoryDetail.test.tsx src/routes/stories.test.tsx
```

- [ ] **Step 3: Implement publication defense and CTAs**

Do not add `is_published` or operational `case_id`. Retain current publish/archive actions. Filter public mapping on `status === 'published'` and expose editorial fields only. Reuse the donation action primitive and prevent the global floating prompt from overlapping the local primary CTA.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/content/contentListRead.server.test.ts src/lib/content/publicStoriesPage.server.test.ts src/components/site/stories/StoryWall.test.tsx src/components/site/stories/StoryDetail.test.tsx src/routes/stories.test.tsx
git add src/lib/content src/components/site/stories src/routes/stories.tsx 'src/routes/stories/$slug.tsx'
git commit -m "feat: strengthen rescue story publishing"
```

---

## Task 7: Publish Fees, Estates, and Shared Guides

**Files:**

- Create: `src/lib/adoptionInformation/publicPage.server.ts`
- Create: `src/lib/adoptionInformation/publicPage.server.test.ts`
- Modify: `src/routes/adoption/instructions.tsx`
- Modify: `src/routes/adoption/instructions.test.tsx`

- [ ] **Step 1: Write failing loader and route tests**

Assert SSR data, two accessible tables, exact 14-row order and values, exact footer, exact estate copy, empty-estate behavior with contact path, and two language-labelled guide links resolving PR 1 asset IDs.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx
```

- [ ] **Step 3: Implement the loader and responsive sections**

Return `{ feesBySpecies, estates, guides }`. Tables sit side by side on desktop and stack on mobile. Use exact footer `All prices subject to adjustment; HKSCDA reserves the right to amend.`, title `可養狗屋苑參考名單`, and disclaimer `以下名單僅供參考，請向屋苑管理處查詢最新規定。`.

Resolve the fixed PR 1 Chinese/English guide slots. These same asset IDs are later referenced by knowledge posts.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx
git add src/lib/adoptionInformation/publicPage.server.ts src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.tsx src/routes/adoption/instructions.test.tsx
git commit -m "feat: publish adoption information"
```

---

## Task 8: Correct and Audit Adult-Cat Copy

**Files:**

- Create: `src/lib/content/adultCatCopy.test.ts`
- Create: `supabase/migrations/20260718111000_correct_adult_cat_copy.sql`
- Modify: only reviewed source/seed files found by the audit

- [ ] **Step 1: Write an exact-copy audit test**

Scan tracked source, migrations, seeds, metadata, and FAQ fixtures for `半歲以下仍屬幼貓`, excluding the audit test and corrective migration. Assert known public copy uses `半歲或以上為成貓`.

- [ ] **Step 2: Run the audit and inspect every match**

```bash
bun test src/lib/content/adultCatCopy.test.ts
rg -n --glob '!docs/**' --glob '!src/lib/content/adultCatCopy.test.ts' "半歲以下仍屬幼貓|幼貓|六個月|半歲" src supabase
```

- [ ] **Step 3: Apply reviewed replacements only**

The SQL migration updates only identified `content_item` records containing the exact old sentence and ends with:

```sql
select id, slug, title
from public.content_item
where body::text like '%半歲以下仍屬幼貓%';
```

Do not replace unrelated uses of `幼貓`.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/content/adultCatCopy.test.ts src/lib/supabaseMigrations.test.ts
git add src/lib/content/adultCatCopy.test.ts supabase/migrations/20260718111000_correct_adult_cat_copy.sql
git add src/lib/content
git commit -m "fix: standardize adult cat guidance"
```

---

## Task 9: Verify, Migrate, Upload, and Deploy PR 2

- [ ] **Step 1: Run focused and full checks**

```bash
bun test src/lib/publicAdoption src/lib/adoptionInformation src/lib/content src/components/site/adoption src/components/site/stories src/routes/adoption src/routes/stories.test.tsx src/lib/supabaseMigrations.test.ts
bun test
bun run typecheck
bun run build
```

Record unrelated baseline failures separately; no new focused failure may remain.

- [ ] **Step 2: Format and inspect**

```bash
bunx prettier --write src supabase/migrations/20260718110000_adoption_information.sql supabase/migrations/20260718111000_correct_adult_cat_copy.sql
git diff --check
git status --short
```

- [ ] **Step 3: Apply migrations and register guides**

Apply migrations to preview first. Upload the two supplied guide PDFs to PR 1's public bucket, create one asset row per file, bind the Chinese/English slots, and verify MIME, size, and downloads. Reuse existing objects/rows if PR 1 verification already registered them.

- [ ] **Step 4: Browser verification**

Verify desktop/mobile `/stories`, one detail, `/adoption/apply`, `/adoption/instructions`, and `/admin/content/adoption`. Exercise dog, cat, both, species changes, draft restore, unpublished stories, empty estates, and both guide downloads.

- [ ] **Step 5: Deploy and verify production**

Use the existing Vercel flow, apply production migrations once, confirm the newest deployment ID, and re-run public/admin smoke paths.

- [ ] **Step 6: Commit generated route output if changed**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: refresh adoption routes"
```
