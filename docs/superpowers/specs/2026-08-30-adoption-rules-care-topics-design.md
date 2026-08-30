# Adoption Rules & Care Topics CMS Design

**Date:** 2026-08-30
**Status:** Approved in conversation; awaiting written-spec review

## Summary

Moves `/adoption/instructions`'s hardcoded `adoptionRules`/`catCareTopics`/`dogCareTopics` constants (~100 lines, zh-HK only, 12 rules + 15 care topics) into the existing `adoptionInformation` domain as two new admin-manageable, bilingual resources. This closes the "adoption rules and care-topic content" item explicitly deferred in the FAQ CMS design's Out of Scope section — the second and final piece of "BP-3 remainder" alongside FAQ CMS (already shipped, PR #84) and home/about copy (still deferred to its own future phase).

## Current Context

`/adoption/instructions` (`src/routes/adoption/instructions.tsx`) already draws content from two existing domains:

- `adoptionInformation` (`src/lib/adoptionInformation/`) — owns adoption fees and dog-friendly-estate references, already admin-manageable via `/admin/content/adoption` and `AdoptionInformationManagement.tsx`.
- `adoptionGuideReleases` / Documents / Knowledge — owns the bilingual post-adoption-guide PDF releases (a separate, already-shipped CMS workflow; PR #51).

The page also renders three hardcoded, zh-HK-only constants directly in the route file: `adoptionRules` (12 numbered rule strings), `catCareTopics` (7 tabbed topics), `dogCareTopics` (8 tabbed topics). None of this is admin-editable today, and the page has **no language toggle at all** — every heading and string is permanently zh-HK regardless of visitor preference, unlike `/help` (which has a `language` state and toggle).

Separately, `adoptionInformation`'s existing fee/estate mutations use an older, **non-atomic** audit pattern: `service.ts` calls `repo.upsertFee()`/`upsertEstate()` and then makes a *separate*, independently-failable `repo.insertAuditLog()` call afterward (in fact fee upserts make two such calls). This predates the atomic `*_with_audit` RPC pattern CLAUDE.md now mandates and that FAQ/governance/sponsorship already use. This spec does not touch that existing code — see Out of Scope.

## Approved Decisions

- **Bilingual.** The migrated content becomes genuinely bilingual (`{"zh-HK": string, en: string}`), matching FAQ's convention, even though `adoptionInformation`'s existing fee/estate fields are single mixed-language strings (e.g. `"Typical Species 一般品種"`) — those are short labels, not prose; rules/care-topics are full sentences that need real translation.
- **English seed content is drafted by the implementer**, not left blank. Staff can revise anything afterward through the admin UI.
- **Care topics are fully free CRUD** — staff can add, remove, reorder, and re-label topics per species, not just edit the text of a fixed list. Unlike FAQ's 5 categories (a real, fixed taxonomy), this topic list was never a stable taxonomy to begin with.
- **Architecture: extend `adoptionInformation`**, not a new standalone domain. Two new resource types, `rules` and `careTopics`, added to the domain's existing per-resource-method pattern (`upsertFee`/`upsertEstate` → `upsertRule`/`upsertCareTopic`). `careTopics` reuses the domain's existing `animalType: "dog" | "cat"` filter dimension (already used by `fees`) instead of being two separate resources.
- **New mutations use the atomic `*_with_audit` RPC pattern.** The pre-existing fee/estate non-atomic-audit bug is a known, separate issue — flagged as a follow-up, not retrofitted here (see Out of Scope).
- **`is_published` is a plain bidirectional toggle on the upsert form, no separate delete endpoint** — matching how `fees` already works (no delete, just the flag), not how `estates` works (hard delete, no flag). Rules/care-topics are ordered content lists like fees, not a reference list like estates.
- **No `topic_key` field.** The current code links each `Tabs.Trigger`/`Tabs.Content` pair via a `value` string. Since topics are free-CRUD, the topic row's own `id` (UUID) is used for that instead of asking staff to invent a slug.
- **The public page gains a language toggle**, matching `/help`'s pattern (`useState`, an `aria-pressed` toggle button, `lang` attribute on the content wrapper) — otherwise the bilingual data model would have no visitor-facing effect. Only the new rules/care-topics content and the page's own static headings/labels respect the toggle; the existing fees/estates/guide-PDF sections keep rendering exactly as they do today (fee names are already pre-mixed-language, estates are out of scope, guide PDFs already show both language buttons side by side).

## Data Model

Two new tables, following the exact RLS/grant/`set_updated_at`-trigger convention already used by `adoption_fees`/`dog_friendly_estates` in `supabase/migrations/20260718110000_adoption_information.sql`:

```sql
create table if not exists public.adoption_rules (
  id uuid primary key default gen_random_uuid(),
  content_zh text not null check (char_length(content_zh) between 1 and 500),
  content_en text not null check (char_length(content_en) between 1 and 500),
  sort_order integer not null check (sort_order >= 0),
  is_published boolean not null default true,
  created_by uuid references public.admin_user(id),
  updated_by uuid references public.admin_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sort_order)
);

create table if not exists public.care_topics (
  id uuid primary key default gen_random_uuid(),
  animal_type text not null check (animal_type in ('dog', 'cat')),
  label_zh text not null check (char_length(label_zh) between 1 and 40),
  label_en text not null check (char_length(label_en) between 1 and 40),
  content_zh text not null check (char_length(content_zh) between 1 and 1000),
  content_en text not null check (char_length(content_en) between 1 and 1000),
  sort_order integer not null check (sort_order >= 0),
  is_published boolean not null default true,
  created_by uuid references public.admin_user(id),
  updated_by uuid references public.admin_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (animal_type, sort_order)
);
```

Both: RLS enabled, `grant select, insert, update, delete on ... to service_role`, `revoke all ... from anon, authenticated`, `set_updated_at` trigger, and an index matching the public-read query shape (`is_published, sort_order` for rules; `animal_type, is_published, sort_order` for care topics).

Two `security definer` RPCs, mirroring `upsert_faq_entry_with_audit`'s shape exactly (actor-role guard via `admin_user.auth_user_id` → `admin_user%rowtype`, using `actor.id` for the FK'd `created_by`/`updated_by` columns, `search_path = public, pg_temp`, atomic audit-log insert in the same transaction):

- `upsert_adoption_rule_with_audit(p_actor_user_id uuid, p_id uuid, p_content_zh text, p_content_en text, p_sort_order integer, p_is_published boolean) returns public.adoption_rules`
- `upsert_care_topic_with_audit(p_actor_user_id uuid, p_id uuid, p_animal_type text, p_label_zh text, p_label_en text, p_content_zh text, p_content_en text, p_sort_order integer, p_is_published boolean) returns public.care_topics`

Both revoked from `public`/`anon`/`authenticated`, granted `execute` to `service_role` only. Actor must be an active `staff` or `admin` (same role gate as `contentManagement`, which already gates `/admin/content/adoption`).

Seed data transcribes the current 12 rules + 15 care topics (7 cat + 8 dog) verbatim for `content_zh`/`label_zh`, with English translations drafted during implementation for `content_en`/`label_en`.

## Backend

Extend `src/lib/adoptionInformation/`:

- **`types.ts`**: add a local `BilingualText = Record<"zh-HK" | "en", string>` type (matching FAQ's convention; each domain defines its own rather than sharing one, per existing precedent). Add `AdoptionRuleContent = { id: string; content: BilingualText; sortOrder: number; isPublished: boolean }` and `CareTopic = { id: string; animalType: "dog" | "cat"; label: BilingualText; content: BilingualText; sortOrder: number; isPublished: boolean }`. Extend `AdoptionInformationResource` to `"fees" | "estates" | "rules" | "careTopics"`.
- **`schemas.ts`**: add `adoptionRuleInputSchema`, `careTopicInputSchema` (each with bilingual-field validation, `sortOrder`, `isPublished`); extend `adminAdoptionInformationQuerySchema`'s `resource` enum; extend `adoptionInformationMutationSchema`'s discriminated union with `{ resource: "rule", input }` and `{ resource: "careTopic", input }`.
- **`repository.server.ts`**: add `upsertRule(input)`/`upsertCareTopic(input)` methods calling the two new RPCs; extend `listPublic()` to also fetch `adoption_rules`/`care_topics` (published only, ordered by `sort_order`); extend `listAdmin()` to branch on the two new resource types (same `page`/`pageSize`/`q` search pattern already used for fees/estates).
- **`service.ts`**: add `upsertRule`/`upsertCareTopic` methods — validate via the new schemas, delegate to the repository, **no separate `audit()` call** (the RPC already writes it atomically, same documented deviation as FAQ's service.ts).
- **`http.ts`**: extend the `upsert` handler's discriminated-union branches for the two new resource kinds.
- **`publicPage.server.ts`**: extend `PublicAdoptionPageData` with `rules: AdoptionRuleContent[]` and `careTopics: { cat: CareTopic[]; dog: CareTopic[] }` (mirroring the existing `feesBySpecies` shape).

One new migration file: the two tables, two RPCs, and seed data described above, plus a `supabaseMigrations.test.ts` entry.

## Admin UI

`AdoptionInformationManagement.tsx` (478 lines) already handles fees+estates as a tab-switched single component (`activeTab: AdoptionInformationResource`, shared search/pagination chrome). Rather than growing it further, it stays exactly as-is for fees/estates, and two new self-contained sibling components are added:

- `AdoptionRulesManagement.tsx` — list + inline create/edit form for `adoption_rules` (bilingual content fields, sort order, published toggle).
- `CareTopicsManagement.tsx` — list + inline create/edit form for `care_topics`, with a species selector (dog/cat) and bilingual label+content fields.

`AdoptionInformationManagementRuntime` (the existing component holding `activeTab: AdoptionInformationResource` state) renders one of these two new components when `activeTab` is `"rules"`/`"careTopics"`, alongside its own existing fee/estate rendering when the tab is `"fees"`/`"estates"` — the same `activeTab` switch already there, just with two more branches. No change to the existing fee/estate list/mutation code inside that file.

Following this domain's own established testing precedent (unlike FAQ/governance, `AdoptionInformationManagement.test.tsx` already exists), both new components get dedicated test files.

## Public Route Wiring

`src/routes/adoption/instructions.tsx`:

- Delete the `adoptionRules`/`catCareTopics`/`dogCareTopics` constants.
- Add `const [language, setLanguage] = useState<AdoptionLanguage>("zh-HK")` and a toggle control, matching `/help`'s pattern (`aria-pressed` button pair, `lang` attribute on the content wrapper).
- Add a small `pageCopy[language]` object for the page's own static headings/labels currently hardcoded inline (領養規則/養貓需知/養狗需知/項目/費用/屋苑/地區/備註/etc. — roughly 15-20 short strings).
- `AdoptionInstructionsContent` renders `data.rules`/`data.careTopics.cat`/`data.careTopics.dog` (from the extended `PublicAdoptionPageData`), each entry rendering `.content[language]` / `.label[language]`.
- Fees, estates, and the guide-release PDF section render exactly as today, unchanged — only the static section headings around them move into `pageCopy[language]`.

## Error Handling

Mirrors the established convention: zod-validated row mapping with silent-drop on malformed rows in the public read path (matching FAQ's `repository.server.ts`); `AdoptionInformationConflictError` → 409 for `sort_order` unique-constraint collisions (already exists in `http.ts`, reused as-is); actor-authorization failures (`42501` from the RPC's active-staff/admin guard) surfaced the same way existing `adoptionInformation` mutations already handle them.

## Testing Plan

- `types.ts`/`schemas.ts`: boundary tests for the new bilingual input schemas (length caps, required fields).
- `repository.server.ts`: upsert/list tests for both new resources, including the malformed-row silent-drop case.
- `service.ts`: validate-then-delegate tests, confirming no redundant audit call.
- `http.ts`: request/response shape tests for the two new mutation branches.
- `publicPage.server.ts`: extended to assert `rules`/`careTopics` are included and correctly shaped.
- New migration-safety test in `supabaseMigrations.test.ts`.
- `AdoptionRulesManagement.test.tsx` / `CareTopicsManagement.test.tsx`: new component tests, matching this domain's existing convention.
- `instructions.tsx`/`instructions.test.tsx`: extended to cover the language toggle and the two new content sections.

## Out of Scope

- Fee/estate content translation (their existing single mixed-language strings stay as-is).
- Retrofitting `adoptionInformation`'s existing fee/estate mutations onto the atomic `*_with_audit` RPC pattern — the pre-existing non-atomic-audit bug is real but unrelated to this work; flagged as a separate follow-up.
- The adoption-guide-release PDF workflow (`adoptionGuideReleases` / Documents / Knowledge) — untouched, already its own shipped domain.
- Home/About hardcoded copy — the other deferred BP-3 remainder item, its own future phase.
- A language toggle for any other public page besides `/adoption/instructions`.
