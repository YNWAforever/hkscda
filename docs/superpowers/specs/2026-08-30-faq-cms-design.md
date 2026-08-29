# FAQ CMS Design

## Summary

Move the `/help` page's FAQ content off a static, hardcoded TypeScript file
(`src/lib/help/faq.ts`, 287 lines, 11 bilingual entries) into a database-backed,
admin-manageable resource. This is the first slice of BP-3's remainder — the
original integration plan scoped BP-3 to also cover adoption rules/care
topics and home/about copy, but (per the same precedent BP-3's board-roster
slice set) each of those is a genuinely independent content domain with its
own shape and consumer surface, and is deferred to its own future phase
rather than bundled here.

## Current Context (verified on `main` 2026-08-30)

- `src/lib/help/faq.ts` exports `helpFaqs: HelpFaq[]`, `helpCategoryLabels`,
  and the `HelpFaq`/`HelpCategory`/`HelpCta`/`BilingualText` types. Zero
  database or admin backing exists today — it is a plain static array.
- Consumers, confirmed by direct search: `src/routes/help.tsx` (the page
  itself), `src/lib/help/search.ts`'s `searchHelpFaqs` (keyword/category
  matching), `src/components/site/help/HelpWidget.tsx` and `HelpSearch.tsx`
  (the site-wide help search UI), `src/components/site/help/FaqResultCard.tsx`
  (renders one result). `src/components/site/FAQ.tsx` has zero importers
  anywhere in `src/` — it is dead code and is not touched by this work.
- `HelpFaq.sensitive` (currently set on 3 tax/receipt-related entries) is a
  real, load-bearing flag: `FaqResultCard.tsx` never clamps/truncates a
  sensitive entry's answer even in compact mode, and `search.test.ts`/
  `analytics.test.ts` assert sensitive entries stay intact and redact
  differently in analytics. This flag must survive the migration unchanged.
- `HelpFaq.keywords: Record<HelpLanguage, string[]>` feeds
  `searchHelpFaqs`'s matching directly; `searchHelpFaqs` itself has no
  awareness of where its input array came from, so it needs zero code
  changes once fed a DB-backed array of the same shape.
- The most recent, directly comparable precedent is BP-3's board-roster
  slice (shipped 2026-08-29, `supabase/migrations/20260829120000_governance_board_members.sql`):
  a purpose-built table (not the app's generic content/CMS system), read
  exclusively via the service-role client from a server loader — even for
  genuinely public content — with published-only filtering done in the
  service layer, never via anon RLS. Its own design doc documents this as
  "the actual established convention" in this codebase, confirmed by reading
  `knowledge_posts` and every `publicPage.server.ts` file. That module's file
  layout (`src/lib/governance/`: `types.ts`, `schemas.ts`,
  `repository.server.ts`, `service.ts`, `http.ts`, `publicPage.functions.ts`,
  `publicPage.server.ts`, each with a `.test.ts`) is the template this design
  follows.
- Admin-side precedent: `src/lib/admin/access.ts`'s `AdminAccessArea` union
  and `ROLE_ACCESS` map is how every admin capability is gated (most
  recently `governanceManagement` and `sponsorshipReview`); `adminNav.ts`
  maps nav item ids to sections; admin feature components live under
  `src/components/admin/content/` regardless of backend domain (e.g.
  `GovernanceManagement.tsx` lives there, not under a `governance/`
  subfolder) — a UI-organization convention, not a backend-domain one.
  `src/routes/admin/governance.tsx` is the corresponding thin admin route.

## Approved Decisions

- **Categories stay fixed.** The 5 existing categories (`sponsorship`,
  `adoption`, `tax_receipt`, `donation`, `contact`) remain a code-level enum
  (a `check` constraint on the new table), not an admin-manageable resource.
  Staff can add/edit/reorder/deactivate FAQ *entries* within these
  categories but cannot create new categories. This avoids a second admin
  surface and keeps every place that already assumes the 5-category enum
  (search filtering, widget category chips, `helpCategoryLabels`) unchanged.
- **Keywords stay editable, per language.** The admin editor exposes a
  chip/tag-style input for `keywords_zh`/`keywords_en`, preserving today's
  search behavior and quality exactly — `searchHelpFaqs`'s matching logic is
  untouched.
- **CTA destinations are a fixed preset list, not free text.** The set of
  allowed internal CTA destinations (route + bilingual label + analytics
  action) is a versioned TypeScript constant, `FAQ_CTA_OPTIONS`, in
  `src/lib/faq/schemas.ts` — a code-review-gated decision, consistent with
  routes/analytics event names being code, not data. The admin editor shows
  a dropdown of these presets (plus "no CTA"); the database stores which
  preset (`cta_key`) was chosen, not a raw URL. Adding a new eligible
  destination later is a one-line code change, not a schema change.
- **Publish flow is a simple `is_active` boolean**, matching the
  board-roster precedent — no draft/review/scheduling state machine. FAQ
  content is low-stakes and easy to correct if wrong, unlike the app's
  generic content module's heavier draft→in_review→approved→
  scheduled/published→archived flow, which this explicitly does not reuse.

## Data Model

One new migration, `supabase/migrations/<timestamp>_faq_entry.sql`:

```sql
create table if not exists public.faq_entry (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('sponsorship', 'adoption', 'tax_receipt', 'donation', 'contact')),
  question_zh text not null check (char_length(question_zh) between 1 and 300),
  question_en text not null check (char_length(question_en) between 1 and 300),
  answer_zh text not null check (char_length(answer_zh) between 1 and 4000),
  answer_en text not null check (char_length(answer_en) between 1 and 4000),
  keywords_zh text[] not null default '{}',
  keywords_en text[] not null default '{}',
  cta_key text,
  sensitive boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_entry_public_idx
  on public.faq_entry (category, is_active, sort_order);

alter table public.faq_entry enable row level security;

grant select, insert, update, delete on public.faq_entry to service_role;

revoke all on public.faq_entry from anon, authenticated;

drop trigger if exists set_updated_at on public.faq_entry;
create trigger set_updated_at before update on public.faq_entry
  for each row execute function public.set_updated_at();
```

`cta_key` is a plain `text` column (not a foreign key into a database
table, since the valid set lives in code as `FAQ_CTA_OPTIONS`) validated at
the application layer: the Zod schema for create/update rejects any
`cta_key` not present in `FAQ_CTA_OPTIONS`, and the public read path treats
an unrecognized `cta_key` (e.g. after a future code change removes a preset)
as "no CTA" rather than erroring, so a stale row never breaks the public
page.

### One-time content migration

A seed migration (or a one-off script run once, documented in the PR) inserts
the current 11 `helpFaqs` entries as rows with `is_active = true`, preserving
their existing `sensitive` flags and CTA targets exactly. After the seed is
verified, `src/lib/help/faq.ts` is deleted; its `HelpFaq`/`HelpCategory`/
`BilingualText`/`HelpCta` type definitions move to `src/lib/faq/types.ts`.

## Backend

New module `src/lib/faq/`, mirroring `src/lib/governance/`'s layering:

- `types.ts` — `FaqEntry`, `FaqCategory`, `FaqCtaOption`, admin
  list/detail/upsert input types.
- `schemas.ts` — Zod schemas for admin create/update input (including the
  `cta_key ∈ FAQ_CTA_OPTIONS` check) and the `FAQ_CTA_OPTIONS` constant
  itself (each entry: `key`, `href`, `label: BilingualText`,
  `analyticsAction`, `external?: boolean` — the same shape `HelpCta` has
  today, so the public read path's output type is unchanged).
- `repository.server.ts` — service-role Supabase queries: list (all, for
  admin), list-public (`is_active = true`, ordered by `category,
  sort_order`), get-by-id, insert, update.
- `service.ts` — validates input via the schemas, resolves `cta_key` into
  the full `HelpCta` shape for public reads (dropping an unrecognized key
  rather than erroring).
- `http.ts` — admin HTTP handlers (list/detail/create/update), gated by
  `requireAdmin(request, ["staff", "admin"], client)`.
- `publicPage.functions.ts` / `publicPage.server.ts` — the public,
  server-only read path: `getPublicFaqs()` returns `HelpFaq[]` (same shape
  `helpFaqs` has today) built from `faq_entry` rows, filtered to
  `is_active = true`.

### Admin route and access

- New `AdminAccessArea` value `"faqManagement"`, granted to `staff` and
  `admin` in `ROLE_ACCESS` (not `treasurer`), added to `access.ts` following
  the exact shape of the `governanceManagement`/`sponsorshipReview`
  precedents.
- `src/routes/admin/faq.tsx` (thin route, `beforeLoad` gated by
  `requireAdminPageAccess("faqManagement", ...)`) renders a new
  `FaqManagement.tsx` component in `src/components/admin/content/`
  (matching where `GovernanceManagement.tsx` lives — an admin-UI-location
  convention, independent of the backend module's name). A new nav item is
  added to `adminNav.ts`; FAQ is not folded into an existing section, since
  it isn't naturally a sub-view of anything else in the dashboard.
- `src/routes/api/admin/faq.ts` (+ `$id.ts` for update) wire the HTTP
  handlers, following the `governance.ts` API route's exact shape.

### Admin editor

List view: grouped by category, each row showing question (zh), active
status, sort order — mirrors the board roster's list/active-filter pattern.
Detail/edit form: category dropdown (fixed 5), bilingual question/answer
text fields, a bilingual keyword chip input per language, a CTA dropdown
(`FAQ_CTA_OPTIONS` + "no CTA"), a sensitive toggle, a numeric sort-order
field, and an is_active toggle.

## Public Route Wiring

`src/routes/help.tsx`'s loader replaces its direct `helpFaqs` import with a
call to `getPublicFaqs()` (server-only, published-only, ordered). No other
change to the route. `src/lib/help/search.ts`'s `searchHelpFaqs` requires
**zero code changes** — it operates on whatever `HelpFaq[]` it receives, and
the DB-backed array has the identical shape. `HelpWidget.tsx`, `HelpSearch.tsx`,
and `FaqResultCard.tsx` are all consumers of the `HelpFaq` type and are
unaffected as long as `getPublicFaqs()`'s output matches that shape exactly
(verified by contract, not by these components' own logic changing).

## Error Handling

- Admin create/update: Zod validation failures → 400, including an
  unrecognized `cta_key`.
- Missing FAQ entry on update → 404.
- Non-staff/admin caller → 401/403 via `requireAdmin`.
- Public read (`getPublicFaqs`): never throws to the `/help` route — wraps
  the repository call the same way other public loaders in this codebase do
  (`resilientPublicLoader` / the discriminated-union loader pattern already
  used by other public routes), so a Supabase outage degrades to the
  existing `PublicStateShell` error panel rather than a 500, consistent with
  every other public route's resilience contract.
- An unrecognized `cta_key` on an otherwise-valid row (e.g. after a future
  code change removes a preset) degrades that one entry's CTA to absent,
  never fails the whole page.

## Testing Plan

- **Migration safety**: extend `supabaseMigrations.test.ts` with the
  `faq_entry` migration — anon/authenticated inaccessibility, `check`
  constraint coverage for `category`, RLS enabled, service_role grant,
  `set_updated_at` trigger present.
- **schemas**: `cta_key` accept/reject against `FAQ_CTA_OPTIONS`; field
  length bounds.
- **repository**: list/list-public/get/insert/update against a fake
  Supabase client, ordering by `category, sort_order`.
- **service**: `cta_key` → full `HelpCta` resolution (including the
  unrecognized-key-drops-CTA case); active-only filtering for the public
  path.
- **http**: auth gating, 400/404 mapping, happy paths.
- **Existing FAQ tests** (`faq.test.ts`, `search.test.ts`,
  `FaqResultCard.test.tsx`, `analytics.test.ts`) are adapted to build their
  fixture `HelpFaq[]` inline (or via a small test factory) instead of
  importing the now-deleted static `helpFaqs`; their actual assertions
  (category coverage, sensitive-flag behavior, search matching, analytics
  redaction) are unchanged, since the `HelpFaq` shape itself does not
  change.
- **help.test.ts**: adapted to mock `getPublicFaqs()` instead of the static
  import; asserts the route still renders all categories and respects
  `is_active` filtering.

## Out of Scope

- Admin-manageable FAQ categories (categories stay a fixed code-level enum).
- Free-text/arbitrary CTA URLs (fixed preset list only).
- Draft/review/scheduled-publish workflow (simple active/inactive only).
- Adoption rules and care-topic content (`src/routes/adoption/instructions.tsx`'s
  `adoptionRules`/`catCareTopics`/`dogCareTopics`, ~100 lines) — a separate,
  independent content domain, deferred to its own future phase.
- Home/About hardcoded copy (founding-narrative prose scattered across
  `brand.ts`, `HomeHero.tsx`, `TransparencyBand.tsx`, `BestRescue.tsx`,
  `VolunteerCarousel.tsx`, `about/index.tsx`'s `journey`/`helpPaths`) —
  also deferred; note the homepage/About *impact numbers* are already
  DB-backed via BP-1's aggregate and need no work.
- `src/components/site/FAQ.tsx` — confirmed dead code (zero importers), not
  touched by this work.

## Design Defaults

- Mirror the governance/board-roster module's file layout, RPC-free
  service-role read pattern, and admin-route conventions wherever the shape
  matches.
- Reuse existing helpers unchanged: `requireAdmin`,
  `requireAdminPageAccess`, `canRoleAccessAdminArea`, the
  `resilientPublicLoader`/discriminated-union public-loader pattern,
  `set_updated_at` trigger function.
- Where this content domain's needs diverge from governance's (the CTA
  preset list, the keyword arrays), keep the divergence minimal and
  code-reviewable rather than introducing new generic machinery.
