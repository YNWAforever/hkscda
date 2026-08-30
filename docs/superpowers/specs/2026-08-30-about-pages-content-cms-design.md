# About Pages Content CMS Design

**Date:** 2026-08-30
**Status:** Approved in conversation; awaiting written-spec review

## Summary

Moves the hardcoded zh-HK marketing/mission copy on `/about`, `/about/tnr`, and `/about/cccp` into a new, admin-editable `aboutPages` domain. This is the final open item from "BP-3 remainder" (after FAQ CMS, PR #84, and Adoption Rules & Care Topics CMS, PR #85) — narrowed from the original "home/about page copy" roadmap note once investigation showed the home page (`/`) is already fully componentized/data-driven with nothing static left to move, and `/about/team` was already covered separately by the `governance-team-cms` feature (board roster CMS, merged to `main`).

## Current Context

`src/routes/about/` contains five routes. Three are in scope here:

- `index.tsx` (`/about`) — a large, bespoke page: hero, mission statement, verified-impact band (already data-driven via `getPublicImpactItems()` — unchanged), a 4-step "journey" band, a CCCP/TNR teaser band with two cards, a responsible-adoption band with 3 principle bullets, a 4-card "help paths" band, and a closing CTA. All copy is inline string literals or two hardcoded arrays (`journey`, `helpPaths`).
- `tnr.tsx` (`/about/tnr`) and `cccp.tsx` (`/about/cccp`) — smaller pages built on the shared `PublicPageFrame` component (hero + optional `highlights`/`chapters`/`cta` props). Each has one hardcoded array (`STAGES`, `WORK`) plus inline prose.

Two routes are explicitly out of scope:

- `team.tsx` — already backed by a real `board_member` table, admin UI, and API (branch `docs/governance-team-cms-impl`), a fully separate, already-shipped feature.
- `privacy.tsx` — a numbered legal-clauses list. Left hardcoded; policy text changes should go through a review process, not casual admin editing.

None of the three in-scope pages have any English content today — this is a genuinely new domain, not an extension of an existing one, since nothing existing fits (the `content` domain is the unrelated rescue-story/Story-Wall CMS; `adoptionInformation` is adoption-specific).

## Approved Decisions

- **zh-HK only.** These pages stay Traditional-Chinese-only. Going bilingual would mean drafting a large volume of brand-new marketing/mission English copy from scratch (unlike Adoption Rules & Care Topics, which only needed translations for existing content), which is out of scope for this phase.
- **Fixed fields only, no free CRUD.** Admins edit the text of existing sections, array items, and CTAs. They cannot add, remove, or reorder journey steps, stages, work rows, or help-path cards — each page's array lengths stay exactly as they are today (4 journey steps, 4 help paths, 3 TNR stages, 2 CCCP chapters, 3 CCCP work rows). This is the opposite of Adoption Rules & Care Topics' free-CRUD care topics — these pages' layouts are hand-built around a fixed count, not a genuinely open-ended list.
- **Text only — not images, icons, links, or SEO meta.** Hero images, lucide icons, internal route targets (`href`/`to` on cards and CTA buttons), and `head()` meta/OG tags stay hardcoded in the route files. Only visible body copy (headings, descriptions, bullet/row text, CTA copy, button labels) is admin-editable.
- **Immediate on save, no draft/publish state.** Unlike FAQ entries and adoption rules (independent list items with their own lifecycle), each row here represents "the current text of a page" — closer to a settings value. No `is_published` flag; saving a page's form makes it live immediately.
- **New domain, `src/lib/aboutPages/`.** Nothing existing fits well enough to extend, unlike Adoption Rules & Care Topics where extending `adoptionInformation` was the natural choice.
- **Contact-info sentences stay hardcoded.** TNR's CTA description and CCCP's contact line both interpolate `brand.org.email`/`brand.org.phone` inline. Rather than duplicating those values into editable text (forking them from their single source of truth), the editable field covers only the surrounding sentence; the component keeps appending `brand.org.*` dynamically, exactly as it does today.

## Data Model

One table, one row per page:

```sql
create table if not exists public.about_page_content (
  page_slug text primary key check (page_slug in ('about', 'tnr', 'cccp')),
  content jsonb not null,
  updated_by uuid references public.admin_user(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.about_page_content enable row level security;

grant select, insert, update, delete on public.about_page_content to service_role;
revoke all on public.about_page_content from anon, authenticated;
```

Matches the project's existing convention (see `adoption_rules`/`care_topics`): RLS is defense-in-depth, not the public read path — public SSR loaders read through the app's own service-role repository code, never directly via the anon PostgREST key. No `set_updated_at` trigger needed since `updated_at` is set explicitly by the upsert RPC alongside `updated_by`.

One `security definer` RPC, mirroring `upsert_adoption_rule_with_audit`'s shape (actor-role guard via `admin_user.auth_user_id` → `admin_user%rowtype`, `search_path = public, pg_temp`, atomic audit-log insert in the same transaction):

```sql
upsert_about_page_content_with_audit(
  p_actor_user_id uuid,
  p_page_slug text,
  p_content jsonb
) returns public.about_page_content
```

Revoked from `public`/`anon`/`authenticated`, granted `execute` to `service_role` only. Actor must be an active `staff` or `admin` (same role gate as `contentManagement`, which already gates `/admin/content/adoption`). The RPC does not validate `content`'s internal shape beyond `jsonb not null` — that validation is the app layer's job (Zod, below), matching how this codebase always keeps shape validation out of SQL.

Each page's `content` column holds a JSON object with a **fixed** shape, validated by a matching Zod schema at the app boundary. Representative shape (exact field names finalized during planning):

```ts
// about
type AboutPageContent = {
  hero: { eyebrow: string; title: string; description: string };
  mission: { eyebrow: string; title: string; body: string; sideBadge: string; sideBody: string };
  impact: { eyebrow: string; title: string; description: string };
  journey: { eyebrow: string; title: string; steps: [Step, Step, Step, Step] };
  communityBand: {
    eyebrow: string; title: string; description: string;
    cccpCard: { title: string; description: string };
    tnrCard: { title: string; description: string };
  };
  responsibleAdoption: {
    eyebrow: string; title: string; body: string; linkLabel: string;
    sideTitle: string; principles: [string, string, string];
  };
  helpPaths: { eyebrow: string; title: string; items: [HelpItem, HelpItem, HelpItem, HelpItem] };
  closing: { title: string; description: string; buttonLabel: string };
};
type Step = { title: string; description: string };
type HelpItem = { title: string; description: string; label: string };

// tnr
type TnrPageContent = {
  hero: { eyebrow: string; title: string; description: string };
  stages: [Stage, Stage, Stage];
  chapter: { title: string; description: string; bullets: [string, string, string] };
  cta: { eyebrow: string; title: string; descriptionPrefix: string }; // brand.org.email appended at render
};
type Stage = { title: string; description: string };

// cccp
type CccpPageContent = {
  hero: { eyebrow: string; title: string; description: string };
  chapters: [Chapter, Chapter];
  workRows: [WorkRow, WorkRow, WorkRow];
  cta: { eyebrow: string; title: string; description: string; points: [string, string, string] };
};
type Chapter = { title: string; description: string };
type WorkRow = { scope: string; method: string; result: string };
```

Seed data transcribes each page's current hardcoded text verbatim — shipping this changes nothing visually on day one. Migration verified against a real Postgres container per house convention, since seed strings likely contain apostrophes/quotes that string-matching tests can't validate.

## Backend

New domain `src/lib/aboutPages/`, following the standard layered pattern:

- **`types.ts`**: the three page-content types above, plus `AboutPageSlug = "about" | "tnr" | "cccp"`.
- **`schemas.ts`**: `aboutPageContentSchema`, `tnrPageContentSchema`, `cccpPageContentSchema` (each enforcing the fixed tuple lengths and reasonable character-length caps per field), collected in `PAGE_CONTENT_SCHEMAS: Record<AboutPageSlug, ZodSchema>` so the service can validate against the right shape per slug.
- **`repository.server.ts`**: `getContent(slug)` (single-row select, mapped through the matching Zod schema — malformed/missing rows return `null` rather than throwing, matching FAQ's public-read convention), `upsertContent(slug, content, actorAuthUserId)` (calls the RPC).
- **`service.ts`**: `getPublic(slug)` / `listPublic()` (all three, for use across the three loaders) and `getAdmin(slug)` / `upsertAdmin(slug, content)` — validates `content` against `PAGE_CONTENT_SCHEMAS[slug]` before calling the repository; no separate `audit()` call (the RPC writes it atomically).
- **`http.server.ts`**: GET (by slug) and PUT (by slug) handlers, `requireAdmin` guarded with the same role as `/admin/content/adoption`.
- **`publicPage.functions.ts`**: thin server functions wrapping `service.getPublic(slug)`, one per page, called from each route's loader — mirrors `getPublicAdoptionPage()`'s existing pattern.

New route: `src/routes/api/admin/about-pages/$slug.ts`.

One new migration file: the table, the RPC, and seed data as described above, plus a `supabaseMigrations.test.ts` entry.

## Admin UI

New route `src/routes/admin/content/about.tsx` + `AboutPagesManagement.tsx`, tab-switched between About / TNR / CCCP (same tab pattern as `AdoptionContentTabs`). Each tab renders a form generated from that page's fixed schema — text inputs/textareas grouped and ordered to match the sections as they appear on the live page (Hero, Mission, Journey Steps 1–4, …), so an admin can map a field to what they'll see without cross-referencing the live site. One Save button per page, submitting the whole page's content object in one PUT — no per-field or per-item save, consistent with "fixed fields only."

New nav item added to the Content admin section, with **both** `zh` and `en` copy entries added in the same commit as the nav-item itself (a real bug hit and fixed during Adoption Rules & Care Topics — the nav item and its bilingual admin-UI copy must land together).

## Public Route Wiring

`about/index.tsx`, `about/tnr.tsx`, `about/cccp.tsx`:

- Each loader calls its `getAboutPageContent()` / `getTnrPageContent()` / `getCccpPageContent()` function alongside whatever it already loads (e.g. `about/index.tsx` already loads impact items).
- Each route keeps an in-file `DEFAULT_CONTENT` constant holding today's exact hardcoded copy. The component renders `content ?? DEFAULT_CONTENT` — a missing/malformed row renders identically to current behavior, never a blank section. This is stricter than the home page's existing fallback-to-empty-state pattern (empty animal/story widgets are a normal, expected state; a blank hero or mission section on the About page would be a real visual regression, since that copy *is* the page's content).
- Structural JSX (icons, `href`s, array lengths, layout) stays exactly as it is today; only the string values feeding each element change from literals to `content.section.field`.
- TNR's CTA renders `content.cta.descriptionPrefix + " " + brand.org.email + "。"`, unchanged from today's concatenation, just with the prefix now sourced from `content` instead of a literal.

## Error Handling

Mirrors existing convention: Zod-validated row mapping with fallback-to-default (not silent-drop, since unlike FAQ/rules lists a missing "row" here must still render *something* rather than omitting an item) in the public read path; actor-authorization failures (`42501` from the RPC's active-staff/admin guard) surfaced the same way existing admin mutations already handle them; a malformed PUT payload (schema validation failure) returns 400 with the Zod issue list, matching other domains' `http.server.ts` error shape.

## Testing Plan

- `schemas.ts`: boundary tests for each page's fixed-shape schema (tuple length enforcement, required fields, character caps).
- `repository.server.ts`: get/upsert tests for all three slugs, including the malformed-row fallback-to-default case.
- `service.ts`: validate-then-delegate tests confirming no redundant audit call, and per-slug schema selection.
- `http.server.ts`: request/response shape tests for GET/PUT.
- New migration-safety test in `supabaseMigrations.test.ts`, migration applied to a real Postgres container to catch SQL syntax errors before merge.
- `AboutPagesManagement.test.tsx`: new component test confirming all 3 tabs render with the right fields.
- `about/index.test.tsx`, `about/tnr.test.tsx` (new), `about/cccp.test.tsx` (new): extended/added to cover content flowing from loader to rendered markup, plus the missing-row-falls-back-to-default path.

## Out of Scope

- `/about/team` — already shipped separately (`governance-team-cms`).
- `/about/privacy` — legal text, stays hardcoded.
- Images, icons, internal link targets, and SEO `<head>` meta on all three pages — stay hardcoded.
- English/bilingual content for these three pages.
- Adding, removing, or reordering sections, journey steps, stages, or work rows.
- The home page (`/`) — already fully componentized/data-driven, nothing static left to migrate.
