# Retained work integration — 2026-09-26

## Scope and reconciliation
- Main baseline: 57018a8 (PR 129). Root dirty checkout was preserved.
- Integrated stories child-route rendering and four payment CMS follow-ups.
- Preserved the September 14/15 volunteer production repair evidence and coordinator investigation.
- Completed the August adoption page CMS design with a current-main reconciliation: rules/care topic bilingual editors and public collections already exist. The new document edits only Chinese page headings, labels, introductions and notices. It retains the existing English toggle and database-backed rules, care topics, fees, estates and guide PDFs.
- Supersedes the old plan's duplicate rules/topic arrays. No collections or translations are migrated into the new document.
- The unused About-page component split is not integrated; it has no functional benefit and conflicts with newer main.

## Verification
- Source suite: `bun test --isolate src` — 2486 pass, 80 skip, 0 fail (429 files).
- Focused adoption UI/API/public tests — 43 pass before the final client-wiring fixture update; complete source suite includes that update.
- Stories/payment focused suite — 50 pass.
- TypeScript passes. ESLint: zero errors, 52 existing-style Fast Refresh warnings. Production Vite/Nitro build passes.
- Real Chromium component fixture: save updates draft version; unsaved changes block preview/publish; HTTP409 preserves local text; deliberate reload replaces it; publish and history restore update editor state; zero browser exceptions. API responses in this browser fixture are synthetic.
- Isolated PostgreSQL: copied schema only (no application data) from the existing local policy cluster into new database `adoption_cms_20260926`, restored ACLs, applied new migration atomically, and ran `supabase/tests/adoption-instructions-cms.sql` as service_role. All fixture mutations rolled back.
- SQL checks passed: singleton/seed, strict validation, RLS/grants, staff save, public/draft isolation, denied staff publish, stale-version rejection, admin publish, idempotent retry, key mismatch rejection, restore without publication, history preservation and rejection of a stale token from a prior draft.
- Fixed retained-work bugs: malformed SQL seed JSON; invalid multidimensional text-path array; publish service bypassing replay lookup after draft consumption; optimistic versions reused by later drafts. Publish keys now bind actor and expected version.

## Baseline limits
The clean baseline full suite was 2523 pass, 81 skip, 2 fail on the already-running default local Supabase stack: direct admin_user UPDATE expected an error and sponsorship fixture consent source was unsupported. These local RLS baseline failures are unrelated to this integration. Existing shared stacks were not reset or migrated.

## Release gate
Migration: `supabase/migrations/20260926152438_adoption_instruction_page_cms.sql`.
The CLI generated a new current timestamp; the never-integrated August migration was replaced. Before adopting this migration on any database, confirm the old August version and new tables are absent. If already applied elsewhere, reconcile through an additional forward migration instead of replaying it.

Deploy sequence: approve production migration, take the normal private backup, rehearse against the current schema, apply the additive migration, verify seed and service-only RPC permissions, then merge the adoption PR. The new public reader requires the published seed; do not merge its PR before this gate. No production database mutation or publication was performed here.
The stories/payment/evidence PR has no migration dependency and can merge independently.

## Fresh review and recovery fix
A fresh whole-branch reviewer found one Important issue: restoring history required publishing an existing draft. Added admin-only DELETE draft / archive RPC with expected-version enforcement. It archives the saved draft, preserves history and the public revision, and permits restore. Staff/stale archive calls are rejected. The service regression test failed before implementation and passed after; full isolated source suite is now 2486 pass, 80 skip, zero fail. Browser fixture and real SQL archive-then-restore checks passed.

The reviewer found no remaining Critical issues; the potential trailing-slash story issue was withdrawn after a full router load demonstrated a 307 canonical redirect. Production schema/deployment, real authenticated browser integration, simultaneous multi-session contention and comprehensive accessibility were not independently certified by the reviewer.

PRs: #131 stories/payment/evidence; #132 adoption CMS (draft pending migration approval). GitHub Actions did not start: account payments/spending-limit blocker, not a code test failure. Vercel preview for #131 passed.

## Publication and cleanup
- PR #131 merged normally into main as b77e4cde6c90d52d2f9ceeb48c8857d264d34694 (no administrator override). Adoption PR #132 includes that merge and remains draft.
- Removed five reviewed source worktrees: public-route-port-group4, payment-public-config, adoption-http-boundary, about-pages-content-cms, admin-volunteer-settings-20260913. Removed their five local branches and four remaining obsolete remote branches. Removed the merged temporary PR #131 branch too.
- Original commits are in a verified Git bundle; working files, ignored notes and local evidence are in verified ZIP archives under the original checkout's ignored `.superpowers/retained-work-archive-20260926/`. A SHA256 manifest records branch heads and dirty status. Volunteer archive was recreated and every current source file compared byte-for-byte after a Windows newline status-comparison mismatch. No work was discarded due to that false mismatch.
- Root remains at its original checkout with 155 status entries. PR #130 and the active adoption integration checkout are retained. 37 worktrees remain registered; this cleanup applies to the five specifically reviewed worktrees, not unrelated active work.
- Full brand sweep against the dev server was not green: TanStack's virtual client entry returned404, preventing hydration across routes. The production bundle builds successfully; this dev-server result is not treated as successful brand verification.

Production-bundle targeted Chromium verification against the local HTTP fixture passed: adoption page HTTP200, English toggle functional, anonymous CMS GET HTTP401, authenticated preview redirects to login. No production database was accessed.

Temporary browser servers were stopped. Final removal of disposable database adoption_cms_20260926 was blocked because Docker Desktop's Linux engine pipe was unavailable; the database may remain in the local policy-cluster volume until Docker restarts. Production is unaffected. The local SDD progress ledger is retained because automatic approval review rejected its deletion; it is separate from the five removed worktrees.
