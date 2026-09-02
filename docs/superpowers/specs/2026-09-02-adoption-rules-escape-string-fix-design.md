# Fix `adoption_rules_care_topics`'s Fresh-Database Blocker (E-string quote splitting)

**Date:** 2026-09-02
**Status:** Approved in conversation; awaiting written-spec review
**Discovered during:** the previous fresh-database migration fix ([2026-09-02-fresh-db-seed-knowledge-guides-fix](2026-09-02-fresh-db-seed-knowledge-guides-fix-design.md)) — a real `bunx supabase start` replay got past that fix and 15 further migrations, then hit a second, independent blocker in this file.

## Summary

`supabase/migrations/20260830130000_adoption_rules_care_topics.sql` fails on a fresh Supabase CLI database replay with `cannot insert multiple commands into a prepared statement` (SQLSTATE 42601). Root cause: 12 English-translation string literals in this file use PostgreSQL's `E'...'` C-style escape-string syntax with backslash-escaped apostrophes (`\'`) instead of the standard doubled-apostrophe (`''`) form. Supabase CLI's migration-file statement splitter doesn't correctly track `E'...'`'s escape semantics, loses quote-parity at the first `\'`, and consequently fails to recognize the real statement-terminating `;` between this file's two top-level `insert` statements — merging them into one chunk that Postgres's prepared-statement protocol rejects. This is a standalone, independent fix, unrelated to the seed-knowledge-guides fix that surfaced it.

## Current state

- Confirmed via `grep -c "E'" supabase/migrations/20260830130000_adoption_rules_care_topics.sql`: exactly 12 occurrences, all inside the `insert into public.adoption_rules (...)` (6 occurrences, lines 216, 224, 226, 228, 230, 234) and `insert into public.care_topics (...)` (6 occurrences, lines 243, 246, 255, 270, 279, 282) value lists — specifically the `content_en`/`label_en` columns' text.
- Confirmed via a repo-wide grep for `E'.*\\'` across every migration file: this exact pattern (an `E'...'` literal containing a backslash-escaped apostrophe) appears in exactly this one file, nowhere else in migration history. Not a systemic issue.
- Confirmed empirically: after the seed-knowledge-guides fix landed, a real `bunx supabase start` replay against this repo's full migration history proceeds cleanly through this migration's predecessors and fails specifically here, with the error and "At statement: 17" pointing at the merged `adoption_rules`/`care_topics` insert pair.
- Every one of the 12 literals uses the `E` prefix purely as a habit/carryover — none of them use any escape sequence other than `\'` for an apostrophe (no `\n`, `\t`, or other C-style escapes), so converting to a standard string literal is a pure syntax normalization with zero semantic change: `E'it\'s'` and `'it''s'` produce the exact same Postgres string value.

## Approved decision

- **Convert all 12 `E'...'` literals to standard `'...'` literals**, replacing each internal `\'` with `''` (Postgres's standard apostrophe-escaping form for a non-`E`-prefixed string literal). Applies uniformly to every one of the 12 occurrences, including the few that don't actually contain an internal apostrophe (`E'If you rent your home...'`, `E'Applicants must agree to follow-up home visits...'`, `E'The association reserves the right to decline...'`, `E'Provide a safe indoor environment for your cat...'`) — dropping the now-unnecessary `E` prefix from those too, for consistency (a mix of `E'...'` and `'...'` in the same insert block is more confusing to a future maintainer than uniformly using the standard form throughout).
- **No other line in this migration changes** — table definitions, indexes, RLS grants/policies, the two `upsert_*_with_audit` functions, `content_zh`/`label_zh` (Chinese) literals, `sort_order`/`animal_type` values, and both `on conflict ... do update set` clauses stay byte-identical.
- **Editing this already-applied (or not-yet-applied) migration in place is safe** for the same reason as the prior fix: Supabase's CLI/platform tracks applied migrations by version timestamp and never re-runs one that has already succeeded — this change only affects an environment attempting a fresh apply.

## Error handling

No new failure mode is introduced — this is a pure syntax fix to existing, already-correct data values. If the fix is applied incorrectly (e.g., a stray unescaped apostrophe left in a converted literal), the migration would fail with a much more obvious Postgres syntax error at that exact line during any fresh apply attempt — self-evidently catchable, not silent.

## Testing

- New test in `src/lib/supabaseMigrations.test.ts` (matching this repo's existing convention of testing migration content via string assertions) asserting no `E'` escape-string prefix remains anywhere in this file: `expect(sql).not.toMatch(/E'/)`.
- Manual verification: re-run `bunx supabase start` against this repo's full migration history (a fresh database) and confirm replay proceeds past this migration. If a third, different migration failure appears further along, that's a separate, new problem outside this task's scope — report it rather than fixing it as part of this task, matching how the second blocker itself was handled relative to the first fix.

## Out of scope

- Any change to the actual Chinese or English *content* of the adoption rules / care topics — only the quoting syntax changes, not the text itself.
- Any change to `adoption_rules`/`care_topics`'s schema, RLS policies, or the `upsert_*_with_audit` RPC functions.
- Any third fresh-database blocker that might exist further along in migration history, if one is discovered during this task's manual verification step — flagged separately, not fixed here.
