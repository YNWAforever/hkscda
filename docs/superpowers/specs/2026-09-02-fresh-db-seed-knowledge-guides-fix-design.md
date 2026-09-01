# Self-Healing Fallback for `seed_knowledge_guides` on a Fresh Database

**Date:** 2026-09-02
**Status:** Approved in conversation; awaiting written-spec review
**Discovered during:** RLS behavioral test harness setup (Phase 4) — a genuinely fresh Supabase CLI local stack cannot bootstrap today, blocking that work and, more broadly, any future local dev setup, CI database testing, or disaster-recovery restore drill.

## Summary

`supabase/migrations/20260718121000_seed_knowledge_guides.sql` unconditionally raises an exception when a published `post_adoption_guide` document slot doesn't exist for a language, aborting migration replay entirely. On any genuinely fresh database (a new local dev setup, CI, or a disaster-recovery restore test), no such published slot has ever existed — nothing in the migration history inserts one — so this migration fails 100% of the time on a fresh apply. This is a standalone, independent fix, unrelated to the RLS harness work that surfaced it; it lands and merges on its own before that work resumes.

## Current state

- `supabase/migrations/20260718100000_public_documents_and_donation_purpose.sql` creates `public.document_assets` and `public.site_document_slots` (empty tables, no rows inserted).
- `supabase/migrations/20260718121000_seed_knowledge_guides.sql` (21 minutes later, same day) queries `site_document_slots` for a `post_adoption_guide` slot with `is_published = true`, for both `zh-HK` and `en`, and `raise exception`s if either is null, before it can construct the `knowledge_posts` rows that follow.
- `supabase/migrations/20260731120000_adoption_guide_release_cms.sql` (13 days later) adds the actual admin CMS release workflow that lets staff upload and publish a document into a slot like this. This confirms the sequence of events: this migration was written and has only ever successfully run against a database where a human had *already* manually uploaded and published a real document into that slot through the app — external, non-migration state that no fresh database will ever have.
- Confirmed empirically: `bunx supabase start` against this repo's full migration history fails with exactly this error (`Missing published zh-HK post_adoption_guide document slot`, SQLSTATE P0001) on a completely fresh database, after 28 earlier migrations applied successfully.
- Editing this migration's content is safe for already-migrated environments: Supabase's CLI/platform tracks applied migrations by version timestamp in its own migrations-history table and never re-runs one that has already succeeded there. Staging/production already have this migration recorded as applied (against real, already-published data) and will never re-execute the edited version — this change only affects environments attempting a fresh apply, which currently have no working path at all.

## Approved decision

- **Make the migration self-healing**, not merely permissive: when the published slot query returns null for a language, insert a placeholder `document_assets` row (satisfying every check constraint on that table) and a `site_document_slots` row for that language with `is_published = true`, then use that placeholder's `id` for the `knowledge_posts` insert that follows — instead of raising. A fresh database ends up with a real (if placeholder) published document and knowledge post, matching the schema's actual invariants, rather than either crashing or silently skipping the insert.
- Do this **per language independently** (zh-HK and en each get their own null-check-and-create, mirroring the existing per-language query structure) rather than a single combined branch, since either could independently already exist in a partially-seeded environment (defensive, though not currently observed in practice).
- **No other line in this migration changes** — the two existing `select ... into` queries, the final `knowledge_posts` insert/upsert shape, and every value already hardcoded there (titles, topic, short_intro, source_name, sort_order) stay exactly as they are.

## `document_assets` placeholder row shape

Every column in `public.document_assets` has a check constraint (confirmed by reading `20260718100000_public_documents_and_donation_purpose.sql`); the placeholder must satisfy all of them:

| Column | Constraint | Placeholder value |
|---|---|---|
| `kind` | `in ('annual_report', 'wedding_form', 'adoption_guide')` | `'adoption_guide'` |
| `title` | 1-180 chars | e.g. `'Post-adoption guide (placeholder)'` / `'領養後須知（預設佔位）'` |
| `language` | `in ('zh-HK', 'en', 'bilingual')` | `'zh-HK'` or `'en'` matching the slot |
| `bucket_name` | defaults `'site-documents'` | omit (use default) |
| `object_path` | unique, `!~ '(^/|\.\.)'` | e.g. `'placeholder/post-adoption-guide-zh-hk.pdf'` / `'placeholder/post-adoption-guide-en.pdf'` — no real object needs to exist at this path in Storage for the row to insert; it's a text column with a regex/uniqueness check only, not a foreign key into Storage |
| `mime_type` | must be `'application/pdf'` | `'application/pdf'` (default) |
| `byte_size` | `> 0 and <= 52428800` | `1` |
| `checksum_sha256` | nullable | omit (null) |
| `is_published` | default `false` | irrelevant to this migration's own check (only `site_document_slots.is_published` is queried), but set `true` for realism/consistency with the slot |

## Error handling

- The placeholder-creation branch only ever triggers on the missing-slot path (i.e., a fresh database) — an environment where a real document was already published takes the existing, unchanged success path with zero behavior change.
- No new failure mode is introduced: if the placeholder insert itself fails (e.g., a future, unrelated constraint added to `document_assets`), the migration still fails loudly, which is correct — the goal is graceful handling of *this specific, known* missing-data case, not swallowing every possible error.

## Testing

- New test in `src/lib/supabaseMigrations.test.ts` (or a new focused file, matching this repo's existing convention of testing migration *content* via string assertions rather than requiring a live database — confirm the established file/pattern at implementation time) asserting the migration's SQL text contains the self-healing insert branch for both languages, rather than an unconditional `raise exception` with no prior fallback.
- Manual verification: re-run `bunx supabase start` against this repo's full migration history (a fresh database) and confirm it now completes successfully past this migration, proceeding through the remaining migrations.

## Out of scope

- Any change to how real documents get published via the admin CMS (`adoption_guide_release_cms` and its release workflow) — untouched.
- Any change to the `knowledge_posts`/`site_document_slots`/`document_assets` schema.
- The RLS behavioral test harness itself (Phase 4) — resumes as its own spec/plan once this fix is merged.
- Any other Phase 4 item.
