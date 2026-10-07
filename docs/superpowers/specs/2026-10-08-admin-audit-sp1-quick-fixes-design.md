# Admin audit SP-1: quick fixes and a trustworthy local test run

Date: 2026-10-08 · Base: `origin/main @ 4bfca5c` · Branch: `codex/audit-final-sp1-20261008`

## Context

The "HKSCDA Admin Panel — Final Audit, Use Cases & UX Spec" (2026-10-07) ends in a
fix list F-01..F-12. That list is split into six sub-projects, each with its own
spec, plan and PR:

| # | Sub-project | Audit items |
| --- | --- | --- |
| **SP-1** | Quick code fixes (this spec) | F-05, F-06, F-07, F-08, F-09 |
| SP-2 | Background jobs | F-02, F-04 — starts by confirming the Vercel plan and whether crons actually fire |
| SP-3 | Public content safety | F-01 (code half), F-11 — waits for the `feat/story-promotion-*` branches |
| SP-4 | FAQ search-quality loop | F-10 — needs a migration |
| SP-5 | Admin UX-spec conformance | Audit section 8, including the EN-toggle decision (C-05) |
| SP-6 | Owner and ops actions | F-01 unpublish, F-03 staff testing, F-12 domain, sign-off items |

### Audit claims corrected by this investigation

Checked against `origin/main @ 4bfca5c` on 2026-10-08:

- **F-05 is misdiagnosed.** The audit reports 26 failures "under Bun 1.4.2 only".
  A plain `bun test` fails 64 tests plus one unhandled error on this machine on
  **both** 1.3.14 and 1.4.2, with identical failures. Every failing file passes on
  its own. CI is green because it runs `bun test --isolate` (`ci.yml:38`), while the
  `test` script in `package.json` and the `CLAUDE.md`/`AGENTS.md` instructions use a
  bare `bun test`. With `--isolate`, 58 of the 64 failures and the unhandled error
  disappear. The remaining 6 are in `supabase/rls-tests`; they run whenever a local
  Supabase stack answers on `127.0.0.1:55321`, and fail against a shared stack that
  was not built from this branch's migrations. The Bun version is not a factor.
- **F-07 overstates the defect.** `MatchPanel.tsx:158` and `AnimalPipeline.tsx:175/185`
  *read* from the browser client; no admin component writes to the database from the
  browser any more. Match creation already goes through
  `/api/admin/adoptions/cases/{id}/matches`. The "Legacy exception" paragraph in
  `CLAUDE.md`/`AGENTS.md` still describes browser writes and is stale.
- **F-06 is wider than reported.** Eight public routes inherit the homepage title,
  not three: `/animals/cat`, `/animals/dog`, `/sponsors`, `/sponsors/pledge`,
  `/adoption/apply`, `/internships`, `/supporter`, `/volunteer/operations`. The three
  private token status pages have no title either. `/stories` and `/knowledge`,
  listed in the audit, already set theirs.

## Goal

Close the code-only audit items that need no migration and no owner decision, and
make a local test run mean the same thing as CI, so every later sub-project can
gate on it.

## Non-goals

- Fixing the individual `mock.module` and global leaks between test files.
  `--isolate` makes them harmless by giving each file a fresh global object, which is
  how CI already runs. A randomised-order CI job, proposed during design, is dropped:
  nothing found here needs it.
- Moving CI to Bun 1.4.x.
- Scheduling `adoption-uploads` / `public-media-repair` (F-04) — moved to SP-2,
  because a new daily cron depends on the plan check there.
- The admin EN toggle and other section-8 UX rules — SP-5.
- Any copy or content decision beyond page titles and one heading.

## Design

### T1 — Local test command matches CI (replaces F-05)

- `package.json`: `"test": "bun test --isolate"`.
- Probe whether `bunfig.toml` honours `[test] isolate = true` on Bun 1.3.14 (a
  scratch file pair where one file sets a global and the other asserts it is
  absent, run in both orders). If it does, set it in `bunfig.toml` as well, so a
  bare `bun test` is covered too. If it does not, the `package.json` script is the
  only entry point, and the docs say so.
- `CLAUDE.md` and `AGENTS.md`, Build & Run: the test line becomes `bun run test`
  (adds `--isolate`, as CI does), with the current counts (≈5,460 tests, 636 files,
  about a minute) replacing the stale "~1090 tests, a few seconds". It notes that
  `supabase/rls-tests` run only when a local stack answers on port 55321, and that
  a stack shared with other worktrees gives false failures — use
  `SUPABASE_LOCAL_URL=http://127.0.0.1:1` to skip them for a unit-only run.
- Contract test `src/lib/testRunnerContract.test.ts`: the `test` script contains
  `--isolate`, and the CI unit-test step runs either `bun run test` or
  `bun test --isolate`.
- CI's unit step changes to `bun run test`, so there is one definition of the flags.

**Done when:** `SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun run test` passes in full on
this Windows machine on both Bun 1.3.14 and 1.4.2.

### T2 — One Bun version for CI and local

- Add `.bun-version` containing `1.3.14`.
- The five `oven-sh/setup-bun@v2` steps in `ci.yml` (lines 27, 72, 176, 267, 408)
  replace `bun-version: 1.3.14` with `bun-version-file: .bun-version`.
- Extend `testRunnerContract.test.ts`: `.bun-version` holds one exact semver, and no
  workflow step hardcodes `bun-version:`.
- No `engines` field. Bun does not enforce it, and its effect on the Vercel build is
  unverified. After the merge, compare the production build log's install step with
  the previous deploy.

### T3 — Every public page has its own title (F-06)

- New helper `src/lib/pageHead.ts`, `pageHead(page)`, returning `{ meta, links }`.
  It takes one of two page kinds:
  - an indexable page, `{ title, description, path }`: emits `title`,
    `description`, `og:title`, `og:description`, `twitter:title`,
    `twitter:description` and a canonical link built with the existing
    `publicUrl(path)`.
  - a private page, `{ title, private: true }`: emits `title`,
    `robots: noindex, nofollow, noarchive` and `referrer: no-referrer`, with no
    canonical, Open Graph or Twitter tags. This is the meta the three token status
    pages already set by hand.
- Title format follows `/knowledge` and `/stories`:
  `<page name> · 香港拯救貓狗協會 HKSCDA`. The page name is the page's own visible
  `h1` wording, so no new copy is invented. Descriptions are one factual zh-HK
  sentence about what the page lets the visitor do. They are listed in the plan for
  the content owner to review in the PR.
- Apply it to the eight public routes above. On the three token status pages
  (`adoption/status.$token`, `sponsors_.status.$token`, `volunteer/status.$token`),
  add a title and keep the existing `noindex` and `no-referrer` meta.
- Existing routes that already set titles are not migrated to the helper.
- Guard test `src/routes/publicRouteHead.test.ts`: every route file under
  `src/routes` outside `admin/` and `api/`, other than `__root.tsx`, test files,
  `-`-prefixed helpers and an explicit allowlist of redirect-only routes
  (`about/cccp.tsx`), declares a title, either through `pageHead(` or a
  `{ title:` meta entry. A unit test covers `pageHead` output for the indexable
  and `robots` cases.

### T4 — Admin uses design tokens; login and reset have an h1 (F-08)

- Replace every hardcoded Tailwind palette class in admin with `var(--color-*)`
  tokens: 44 occurrences on 32 lines in 11 files (`routes/admin/login.tsx`,
  `routes/admin/reset-password.tsx`, `routes/admin/animals/$id.edit.tsx`,
  `components/admin/AnimalForm.tsx`, `components/admin/sponsorship/AnimalPicker.tsx`,
  `components/admin/content/{ContentEditor,FaqManagement,GovernanceManagement,PaymentMethodsManagement}.tsx`,
  `components/admin/volunteers/{VolunteerPolicySources,VolunteerPolicySimulation}.tsx`).
  The public site already has none. On login and reset, the page background uses
  `--color-panel` (the admin sidebar colour), and the submit button uses
  `--color-primary` / `--color-primary-hover` / `--color-primary-foreground`.
  Status colours map to the semantic `--color-{success,warning,error}` and
  `-highlight` pairs.
- Add one `<h1>` to the login form and one to the reset form. The existing subtitle
  line (`copy.login.subtitle` 管理後台登入 / `copy.login.resetTitle` 重設密碼) becomes
  the `h1`, so no new copy keys are needed. The EN toggle stays as it is.
- Guard test `src/components/admin/adminTokenGuard.test.ts`: no non-test file under
  `src/routes/admin` or `src/components/admin` contains a Tailwind palette-scale class
  (any of the 22 named palettes, `slate` through `rose`), with or without a variant
  prefix such as `hover:`. Like `publicCopyGuard.test.ts`, it includes a self-check
  that the matcher catches a sample string.
- Extend `routes/admin/login.test.tsx` and `reset-password.test.tsx`: exactly one
  `h1` is rendered.

### T5 — `/donate` has no English heading in zh-HK (F-09)

- Move the hardcoded legend at `donate.tsx:798` into the page's existing `copy`
  record: zh-HK `收據及通訊同意`, en `Receipts and communication consent`.
- Extend `routes/donate.test.tsx`: the zh-HK render contains the zh legend and not the
  English one.

### T6 — Admin browser code does not query the database (F-07, corrected)

- Three admin GET endpoints, one per browser query being replaced, so each
  component's React Query key keeps a single fetch. They are layered like the rest of
  `adoptions` (route → `-handlers.ts` → `http` → `service` → `repository.server`)
  and authorise with `requireCoordinator` (staff and admin), the same check
  `POST cases/{id}/matches` and `GET animals/pipeline` use:
  - `GET /api/admin/adoptions/animals/match-options` →
    `{ animals: { id, name, name_en, type, status }[] }`, with status
    `available` or `fostered` (the values `matchPanelLogic.ts` uses today), ordered by
    `type`, then `name`.
  - `GET /api/admin/adoptions/positions` → `{ positions: AnimalPosition[] }`.
  - `GET /api/admin/adoptions/arrival-sources` →
    `{ arrivalSources: ArrivalSource[] }`.

  The last two return the same columns, in the same order, as the browser queries
  they replace.
- `MatchPanel` and `AnimalPipeline` call these with the existing `fetchAdminJson`
  helper. The React Query keys and the components' loading and error states are
  unchanged.
- Guard test `src/components/admin/adminBrowserDataGuard.test.ts`: no non-test file
  under `src/components/admin` or `src/routes/admin` matches
  `/\bsupabase\s*\.\s*(from|rpc)\s*\(/` (`supabase.auth.*` and
  `supabase.storage.from` stay allowed), with a matcher self-check.
- `CLAUDE.md`/`AGENTS.md`: rewrite the "Legacy exception" paragraph to say admin
  browser code no longer reads or writes tables directly. Keep the
  `log_animal_mutation` trigger and `*_with_audit` guidance, since that still governs
  JWT writes. `AGENTS.md` currently shows the em dashes in that paragraph as `??`
  mojibake; fix them while editing it.
- Handler tests follow the existing adoptions handler tests: role refusal, response
  shape, and the status filter passed to the repository.

## Order and gates

Tasks run in the order T1 → T2 → T3 → T4 → T5 → T6. T1 comes first because every
later gate depends on it. After each task, run the full gate:
`bun run typecheck`, `bun run lint`, and
`SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun run test`. All must pass in full, never
scoped to the changed files.

Never reset the shared local Supabase stack. If a check needs the database, use a
stack started from this worktree, or rely on CI's database jobs.

The branch name matches the `codex/audit-*` pattern in `vercel.json`, so pushing it
creates no public preview. Merging to `main` deploys to production, so the merge
waits for explicit release approval. No migration ships in SP-1.

## Risks

- **`[test] isolate` in bunfig.** If Bun ignores it silently, a bare `bun test` stays
  leaky. The probe in T1 decides, and the docs point at `bun run test` either way.
- **`.bun-version` and Vercel.** Whether Vercel's build reads `.bun-version` is
  unknown. If it does, the production build's Bun could change. Mitigation: compare
  the post-merge build log, and revert the file if the install step changed.
- **Title wording.** Titles reuse each page's existing `h1`. Descriptions are new copy
  and go to the content owner for review in the PR.
