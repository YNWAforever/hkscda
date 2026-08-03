# Volunteer and Knowledge Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the individual-volunteer age policy, add an activity-agnostic group-enquiry workflow with admin follow-up, and publish a fast SSR knowledge hub that reuses shared guides.

**Architecture:** Preserve the current activity-specific volunteer registration path. Add a separate `groupEnquiries` domain with public persistence-before-notification semantics and an admin summary/detail API. Add a `knowledge` domain using PR 1 document assets, server loaders, and publication filters. Navigation and sitemap updates expose both routes consistently.

**Tech Stack:** TanStack Start, React 19, TypeScript, Zod, Tailwind CSS, Supabase Postgres/Storage, Bun test, Vite, Playwright, Turnstile

## Global Constraints

- Start after PR 2 merges and rebase onto that merge.
- Do not convert existing activity group registration into the new enquiry flow.
- Public group submissions use existing Turnstile, rate-limit, safe-error, and request-ID conventions.
- Persist before notifying; notification failure never rolls back a valid enquiry.
- Public knowledge queries enforce publication in SQL and mapping.
- Knowledge guide entries reference PR 2 asset IDs; no duplicate PDFs.
- Preserve exact approved Chinese copy and external URLs.
- Write failing tests before production code and commit every independently reviewable task.

---

## Task 1: Add Group Enquiry and Knowledge Schemas

**Files:**

- Create: `supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write a failing migration contract test**

```ts
test("adds group enquiries and publish-safe knowledge posts", () => {
  const sql = readMigration("20260718120000_group_enquiries_and_knowledge.sql");
  expect(sql).toContain("create table if not exists public.group_enquiries");
  expect(sql).toContain("notification_status");
  expect(sql).toContain("create table if not exists public.knowledge_posts");
  expect(sql).toContain("num_nonnulls(external_url, document_asset_id) = 1");
  expect(sql).toContain("https://www.hk01.com/article/288651");
  expect(sql).toContain(
    "https://www.10life.com/zh-HK/blog/Pet-Owners-Alert-Comparing-Pet-Insurance-Coverage",
  );
  expect(sql).toContain("revoke all on public.group_enquiries from anon, authenticated");
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/supabaseMigrations.test.ts
```

- [ ] **Step 3: Implement `group_enquiries`**

Use the approved columns and constraints:

```sql
check (activity_type in ('group_workshop', 'school_talk', 'shelter_visit', 'other')),
check (status in ('new', 'in_progress', 'resolved', 'closed')),
check (notification_status in ('pending', 'sent', 'failed')),
check (
  (activity_type = 'other' and nullif(trim(other_activity_description), '') is not null)
  or (activity_type <> 'other' and other_activity_description is null)
),
check (participant_count is null or participant_count > 0)
```

Add `idempotency_key text not null unique`, normalized email/phone, nullable assignment to the existing admin user table, timestamps, `updated_at` trigger, and indexes `(status, created_at desc)`, `(notification_status, created_at desc)`, and `(assigned_to, status)`.

- [ ] **Step 4: Implement `knowledge_posts` and seeds**

Enforce exactly one destination with `num_nonnulls(external_url, document_asset_id) = 1`; require HTTPS external URLs; index `(is_published, sort_order, created_at desc)`. Add partial unique indexes for non-null `external_url` and `document_asset_id` so seeds are idempotent. Seed the two approved external posts with exact title, topic, intro, source, and URL. Do not seed guide entries until their PR 2 asset IDs are resolved.

Enable RLS on both tables, grant CRUD only to `service_role`, and revoke `anon, authenticated` table access.

- [ ] **Step 5: Test and commit**

```bash
bun test src/lib/supabaseMigrations.test.ts
git add supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add group enquiry and knowledge schema"
```

---

## Task 2: Enforce the Individual Volunteer Age Floor

**Files:**

- Modify: `src/lib/volunteers/schemas.ts`
- Modify: `src/lib/volunteers/schemas.test.ts`
- Modify: `src/lib/volunteers/service.ts`
- Modify: `src/lib/volunteers/service.test.ts`
- Modify: `src/routes/volunteer.tsx`
- Modify: `src/routes/volunteer.test.tsx`

- [ ] **Step 1: Write failing policy and copy tests**

Assert that individual applicants under 21 are rejected server-side and in UI; age 21 passes unless an activity has a stricter rule. Existing activity-specific group payloads remain valid. Assert exact title `個人義工報名`, disclaimer `只接受21歲以上個人義工申請`, and a link to `/volunteer/group`.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/volunteers/schemas.test.ts src/lib/volunteers/service.test.ts src/routes/volunteer.test.tsx
```

- [ ] **Step 3: Implement one shared minimum-age rule**

Export `PUBLIC_INDIVIDUAL_MIN_AGE = 21` from the volunteer domain and use it in schema validation, service validation, and display copy. Combine with stricter activity constraints using `Math.max(PUBLIC_INDIVIDUAL_MIN_AGE, activity.minimumAge ?? 0)`. Do not alter the activity-specific group branch.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/volunteers/schemas.test.ts src/lib/volunteers/service.test.ts src/routes/volunteer.test.tsx
git add src/lib/volunteers src/routes/volunteer.tsx src/routes/volunteer.test.tsx
git commit -m "feat: enforce volunteer age policy"
```

---

## Task 3: Build Group Enquiry Contracts and Persistence

**Files:**

- Create: `src/lib/groupEnquiries/types.ts`
- Create: `src/lib/groupEnquiries/schemas.ts`
- Create: `src/lib/groupEnquiries/schemas.test.ts`
- Create: `src/lib/groupEnquiries/repository.server.ts`
- Create: `src/lib/groupEnquiries/repository.server.test.ts`
- Create: `src/lib/groupEnquiries/service.ts`
- Create: `src/lib/groupEnquiries/service.test.ts`
- Create: `src/lib/groupEnquiries/http.ts`

- [ ] **Step 1: Write failing schema and service tests**

Cover required fields, normalized email/phone, positive optional count, enum values, conditional `otherActivityDescription`, maximum lengths, stripping unknown public fields, idempotency replay, and safe duplicate handling.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/groupEnquiries
```

- [ ] **Step 3: Implement public and admin schemas**

```ts
export const publicGroupEnquirySchema = z
  .object({
    organisationName: z.string().trim().min(1).max(160),
    contactPerson: z.string().trim().min(1).max(120),
    email: normalizedEmailSchema,
    phone: normalizedPhoneSchema,
    activityType: z.enum(["group_workshop", "school_talk", "shelter_visit", "other"]),
    otherActivityDescription: z.string().trim().max(500).optional(),
    participantCount: z.coerce.number().int().positive().max(500).optional(),
    participantAgeProfile: z.string().trim().max(200).optional(),
    preferredDateNotes: z.string().trim().max(300).optional(),
    message: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().uuid(),
    turnstileToken: z.string().min(1),
  })
  .superRefine(requireOtherDescription);
```

Keep `status`, assignment, notes, and notification internals out of public input/output.

- [ ] **Step 4: Implement persistence-first service**

```ts
export interface GroupEnquiryRepository {
  createOrGet(input: GroupEnquiryInsert): Promise<{
    enquiry: GroupEnquiry;
    created: boolean;
  }>;
  markNotificationSent(id: string): Promise<void>;
  markNotificationFailed(id: string, safeError: string): Promise<void>;
}
```

`createOrGet` uses the unique idempotency key and returns the existing row on a bounded retry. The service returns public success after persistence even when notification later fails.

- [ ] **Step 5: Test and commit**

```bash
bun test src/lib/groupEnquiries
git add src/lib/groupEnquiries
git commit -m "feat: add group enquiry persistence"
```

---

## Task 4: Add Public Group Enquiry API and Notification

**Files:**

- Create: `src/routes/api/volunteer/group-enquiries.ts`
- Create: `src/routes/api/volunteer/group-enquiries.test.ts`
- Create: `src/lib/groupEnquiries/notifications.server.ts`
- Create: `src/lib/groupEnquiries/notifications.server.test.ts`
- Modify: the existing volunteer notification transport only if a reusable primitive is required

- [ ] **Step 1: Write failing handler and notification tests**

Cover method rejection, malformed JSON, schema errors, Turnstile failure, rate limiting, repeated idempotency key, persistence-before-email order, escaped public fields, sent/failed state updates, neutral success response, and request IDs.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/routes/api/volunteer/group-enquiries.test.ts src/lib/groupEnquiries/notifications.server.test.ts
```

- [ ] **Step 3: Implement the public handler**

Follow the existing volunteer public-form pipeline: parse body, validate schema, verify Turnstile, apply rate limit, persist, then attempt notification. Return `202` or the repository's established successful-create status once the row exists. Never expose `notification_error`.

- [ ] **Step 4: Implement safe notification state transitions**

Escape all submitted fields before interpolating HTML. On send success, write `sent`; on failure, store `failed` plus a bounded internal diagnostic and still return neutral public success.

- [ ] **Step 5: Test and commit**

```bash
bun test src/routes/api/volunteer/group-enquiries.test.ts src/lib/groupEnquiries/notifications.server.test.ts
git add src/routes/api/volunteer/group-enquiries.ts src/routes/api/volunteer/group-enquiries.test.ts src/lib/groupEnquiries
git commit -m "feat: accept group activity enquiries"
```

---

## Task 5: Build `/volunteer/group`

**Files:**

- Create: `src/routes/volunteer/group.tsx`
- Create: `src/routes/volunteer/group.test.tsx`
- Create: `src/components/site/volunteer/GroupEnquiryForm.tsx`
- Create: `src/components/site/volunteer/GroupEnquiryForm.test.tsx`
- Modify: `src/routes/volunteer.tsx`

- [ ] **Step 1: Write failing page tests**

Assert exact title `團體活動查詢`, disclaimer `本頁僅供註冊團體使用。`, five required fields, optional planning fields, all four activity labels, conditional required `請描述活動內容`, stable pending state, neutral success, retry-safe idempotency, accessible errors, and a route link from `/volunteer`.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/routes/volunteer/group.test.tsx src/components/site/volunteer/GroupEnquiryForm.test.tsx
```

- [ ] **Step 3: Implement the form**

Use this exact option map:

```ts
const ACTIVITY_LABELS = {
  group_workshop: "團體義工工作坊",
  school_talk: "入校講座",
  shelter_visit: "貓狗舍教育參觀活動",
  other: "其他活動查詢",
} as const;
```

Use the repo's existing form controls, Turnstile integration, and safe fetch helper. Generate one UUID idempotency key per form attempt and retain it through network retries; issue a new key only after success or an intentional reset. Use a select for activity type and reveal the additional text field only for `other`.

- [ ] **Step 4: Test and commit**

```bash
bun test src/routes/volunteer/group.test.tsx src/components/site/volunteer/GroupEnquiryForm.test.tsx
git add src/routes/volunteer/group.tsx src/routes/volunteer/group.test.tsx src/components/site/volunteer src/routes/volunteer.tsx
git commit -m "feat: add group enquiry page"
```

---

## Task 6: Add Group Enquiry Administration

**Files:**

- Create: `src/routes/api/admin/volunteers/group-enquiries.ts`
- Create: `src/routes/api/admin/volunteers/group-enquiries.test.ts`
- Create: `src/routes/admin/volunteers/group-enquiries.tsx`
- Create: `src/routes/admin/volunteers/group-enquiries.test.tsx`
- Create: `src/components/admin/volunteers/GroupEnquiryManagement.tsx`
- Create: `src/components/admin/volunteers/GroupEnquiryManagement.test.tsx`
- Modify: `src/components/admin/volunteers/VolunteerManagement.tsx`
- Modify: `src/components/admin/adminNav.ts`

- [ ] **Step 1: Write failing repository/API tests**

Extend admin repository contracts with bounded search, status filter, page size at most 50, summary-only list select, detail-by-ID, assignment, internal notes, status update, and retry notification. Test authorization, escaped search wildcards, safe not-found/conflict errors, and audit writes for every mutation.

- [ ] **Step 2: Write failing UI tests**

Cover pagination, filters, loading/error/empty states, detail-on-open, assignment, notes, status transitions, failed-notification visibility, and retry feedback.

- [ ] **Step 3: Run and confirm failure**

```bash
bun test src/routes/api/admin/volunteers/group-enquiries.test.ts src/routes/admin/volunteers/group-enquiries.test.tsx src/components/admin/volunteers/GroupEnquiryManagement.test.tsx src/lib/groupEnquiries
```

- [ ] **Step 4: Implement server contracts and handlers**

List only `id, organisation_name, contact_person, activity_type, participant_count, status, notification_status, assigned_to, created_at`; fetch full content on detail open. Escape `%`, `_`, and backslash in search. Use `requireAdmin`, safe JSON errors, request IDs, and existing audit-log service.

Notification retry reads the stored row, sends escaped content, and updates notification state; it never creates another enquiry.

- [ ] **Step 5: Implement the admin UI**

Use an unframed table on desktop and compact repeated items on mobile. Use menus for status/assignment and a detail dialog/drawer for full content and notes. Invalidate list and detail query keys after mutations.

- [ ] **Step 6: Test and commit**

```bash
bun test src/routes/api/admin/volunteers/group-enquiries.test.ts src/routes/admin/volunteers/group-enquiries.test.tsx src/components/admin/volunteers/GroupEnquiryManagement.test.tsx src/lib/groupEnquiries
git add src/routes/api/admin/volunteers/group-enquiries.ts src/routes/api/admin/volunteers/group-enquiries.test.ts src/routes/admin/volunteers/group-enquiries.tsx src/routes/admin/volunteers/group-enquiries.test.tsx src/components/admin/volunteers src/components/admin/adminNav.ts src/lib/groupEnquiries
git commit -m "feat: manage group enquiries"
```

---

## Task 7: Build the Knowledge Domain and Admin API

**Files:**

- Create: `src/lib/knowledge/types.ts`
- Create: `src/lib/knowledge/schemas.ts`
- Create: `src/lib/knowledge/schemas.test.ts`
- Create: `src/lib/knowledge/repository.server.ts`
- Create: `src/lib/knowledge/repository.server.test.ts`
- Create: `src/lib/knowledge/service.ts`
- Create: `src/lib/knowledge/service.test.ts`
- Create: `src/lib/knowledge/http.ts`
- Create: `src/routes/api/admin/knowledge.ts`
- Create: `src/routes/api/admin/knowledge.test.ts`

- [ ] **Step 1: Write failing contract tests**

Cover exactly-one destination, HTTPS-only URLs, document existence/publication, bounded fields, stable sort, public SQL publication filter plus mapper defense, admin pages capped at 50, safe search, and staff/admin authorization.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/knowledge src/routes/api/admin/knowledge.test.ts
```

- [ ] **Step 3: Implement domain boundaries**

```ts
export type KnowledgeDestination =
  | { kind: "external"; url: string }
  | { kind: "document"; assetId: string; url: string };

export interface KnowledgeRepository {
  listPublished(): Promise<KnowledgePost[]>;
  listAdmin(input: AdminKnowledgeQuery): Promise<AdminKnowledgePage>;
  upsert(input: KnowledgePostInput): Promise<KnowledgePost>;
  remove(id: string): Promise<void>;
}
```

Public mapping exposes display fields and resolved safe destination only. Admin mutations write audit-log entries. External URLs are parsed with `URL` and require protocol `https:`.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/knowledge src/routes/api/admin/knowledge.test.ts
git add src/lib/knowledge src/routes/api/admin/knowledge.ts src/routes/api/admin/knowledge.test.ts
git commit -m "feat: add knowledge content service"
```

---

## Task 8: Add Knowledge Admin and Seed Shared Guides

**Files:**

- Create: `src/routes/admin/content/knowledge.tsx`
- Create: `src/routes/admin/content/knowledge.test.tsx`
- Create: `src/components/admin/content/KnowledgeManagement.tsx`
- Create: `src/components/admin/content/KnowledgeManagement.test.tsx`
- Modify: `src/components/admin/content/ContentManagement.tsx`
- Modify: `src/components/admin/adminNav.ts`
- Create: `supabase/migrations/20260718121000_seed_knowledge_guides.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write failing admin UI tests**

Cover external/document modes, HTTPS errors, document picker restricted to published PDFs, publish toggle, ordering, loading/error/empty states, and mutation invalidation.

- [ ] **Step 2: Write a failing shared-guide seed test**

Assert that the migration inserts two knowledge posts by selecting the existing PR 2 Chinese and English guide asset IDs; it must not create `document_assets` or Storage objects and must raise a clear exception if either required asset is absent.

- [ ] **Step 3: Run and confirm failure**

```bash
bun test src/routes/admin/content/knowledge.test.tsx src/components/admin/content/KnowledgeManagement.test.tsx src/lib/supabaseMigrations.test.ts
```

- [ ] **Step 4: Implement admin UI and idempotent guide references**

Use segmented destination mode, existing document selector, publish toggle, and numeric order input. The seed migration inserts two document posts using `select id from document_assets` scoped to the fixed guide slots and `on conflict (document_asset_id) where document_asset_id is not null` behavior backed by Task 1's partial unique index.

- [ ] **Step 5: Test and commit**

```bash
bun test src/routes/admin/content/knowledge.test.tsx src/components/admin/content/KnowledgeManagement.test.tsx src/lib/supabaseMigrations.test.ts
git add src/routes/admin/content/knowledge.tsx src/routes/admin/content/knowledge.test.tsx src/components/admin/content/KnowledgeManagement.tsx src/components/admin/content/KnowledgeManagement.test.tsx src/components/admin/content/ContentManagement.tsx src/components/admin/adminNav.ts supabase/migrations/20260718121000_seed_knowledge_guides.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add knowledge content admin"
```

---

## Task 9: Build the SSR Knowledge Page

**Files:**

- Create: `src/lib/knowledge/publicPage.server.ts`
- Create: `src/lib/knowledge/publicPage.server.test.ts`
- Create: `src/routes/knowledge.tsx`
- Create: `src/routes/knowledge.test.tsx`
- Create: `src/components/site/knowledge/KnowledgeGrid.tsx`
- Create: `src/components/site/knowledge/KnowledgeGrid.test.tsx`

- [ ] **Step 1: Write failing public tests**

Assert loader-provided initial data, title `養貓狗知識專區`, publication filtering, exact two external seeds and two guide entries, source display, `閱讀更多 / Read More`, PDF-specific label, safe `target="_blank" rel="noopener noreferrer"`, stable client-transition skeleton, and responsive repeated-item grid.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test src/lib/knowledge/publicPage.server.test.ts src/routes/knowledge.test.tsx src/components/site/knowledge/KnowledgeGrid.test.tsx
```

- [ ] **Step 3: Implement loader-first rendering**

The route loader calls `listPublished`; do not fetch after hydration. Render compact repeated items with title, topic, intro, optional source, and destination-specific action. Use a skeleton only while TanStack client navigation is pending.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/knowledge/publicPage.server.test.ts src/routes/knowledge.test.tsx src/components/site/knowledge/KnowledgeGrid.test.tsx
git add src/lib/knowledge/publicPage.server.ts src/lib/knowledge/publicPage.server.test.ts src/routes/knowledge.tsx src/routes/knowledge.test.tsx src/components/site/knowledge
git commit -m "feat: add knowledge hub"
```

---

## Task 10: Correct Service Copy, Navigation, and Sitemap

**Files:**

- Create: `src/lib/content/serviceSloganCopy.test.ts`
- Create: `supabase/migrations/20260718122000_correct_service_slogan.sql`
- Modify: reviewed source/seed files found by the audit
- Modify: `src/components/site/Header.tsx`
- Modify: `src/components/site/Header.test.tsx`
- Modify: `src/components/site/Footer.tsx`
- Modify: `src/components/site/Footer.test.tsx`
- Modify: `public/sitemap.xml`
- Modify: sitemap test file identified beside the current sitemap coverage

- [ ] **Step 1: Write failing exact-copy and navigation tests**

Scan tracked source, seeds, metadata, structured-data fixtures, FAQ fixtures, and site configuration for `日夜堅守前線動物救援`. Exclude the audit test and corrective migration. Assert the replacement `本會以預約方式進行拯救與援助服務，並非 24 小時當值。` where the exact source phrase occurs.

Assert desktop/mobile navigation includes `/knowledge`; `/volunteer` links contextually to `/volunteer/group`; sitemap includes both new routes and retains `/report/audit`.

- [ ] **Step 2: Run audits and inspect every match**

```bash
bun test src/lib/content/serviceSloganCopy.test.ts src/components/site/Header.test.tsx src/components/site/Footer.test.tsx
rg -n --glob '!docs/**' --glob '!src/lib/content/serviceSloganCopy.test.ts' "日夜堅守前線動物救援|24 小時|24小時|前線動物救援" src supabase public
```

- [ ] **Step 3: Apply exact reviewed replacements**

The corrective migration updates only known `content_item` or configuration rows containing the exact obsolete sentence and ends with a read-only audit query. Do not make an unbounded replacement of unrelated `24 小時` content.

Add `/knowledge` to the existing public information navigation group on desktop/mobile. Keep `/volunteer/group` contextual unless the current hierarchy remains scannable. Add both routes to static `public/sitemap.xml`.

- [ ] **Step 4: Test and commit**

```bash
bun test src/lib/content/serviceSloganCopy.test.ts src/components/site/Header.test.tsx src/components/site/Footer.test.tsx
git add src/lib/content/serviceSloganCopy.test.ts supabase/migrations/20260718122000_correct_service_slogan.sql src/components/site/Header.tsx src/components/site/Header.test.tsx src/components/site/Footer.tsx src/components/site/Footer.test.tsx public/sitemap.xml
git add src/lib/content
git commit -m "feat: expose volunteer and knowledge routes"
```

---

## Task 11: Verify, Migrate, Seed, and Deploy PR 3

- [ ] **Step 1: Run focused and full checks**

```bash
bun test src/lib/groupEnquiries src/lib/knowledge src/lib/volunteers src/routes/volunteer src/routes/knowledge.test.tsx src/components/site/volunteer src/components/site/knowledge src/components/admin/volunteers src/components/admin/content src/lib/supabaseMigrations.test.ts
bun test
bun run typecheck
bun run build
```

Record unrelated baseline failures separately; no focused regression may remain.

- [ ] **Step 2: Format and inspect**

```bash
bunx prettier --write src supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql supabase/migrations/20260718121000_seed_knowledge_guides.sql supabase/migrations/20260718122000_correct_service_slogan.sql public/sitemap.xml
git diff --check
git status --short
```

- [ ] **Step 3: Apply migrations in preview**

Confirm the two shared guide assets exist before applying the guide seed. Verify exactly four published knowledge entries, no duplicate documents, and RLS/grant posture. Submit one group enquiry, retry with the same key, and confirm one row only.

- [ ] **Step 4: Browser verification**

Verify desktop/mobile `/volunteer`, `/volunteer/group`, `/knowledge`, `/admin/volunteers/group-enquiries`, and `/admin/content/knowledge`. Exercise under-21 rejection, other-activity validation, notification failure/retry, external links, PDFs, publication changes, navigation, and sitemap.

- [ ] **Step 5: Deploy and verify production**

Use the existing Vercel flow, apply production migrations once, confirm the newest deployment ID, and repeat smoke paths plus a safe group-enquiry persistence check.

- [ ] **Step 6: Commit generated route output if changed**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: refresh volunteer and knowledge routes"
```
