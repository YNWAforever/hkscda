# HKSCDA Revision — Baseline Verification

Recorded: 2026-09-11
Recorded by: implementation session working from
`CLAUDE_HKSCDA_IMPLEMENTATION_MASTER_PLAN_v1_2026-09-11_EN.md`.

This file records **verified facts only**. Anything not independently checked in
this session is marked as such.

## 1. Repository, branch and revision

| Fact | Verified value | How it was established |
|---|---|---|
| Repository | `YNWAforever/hkscda` | `git remote -v` → `https://github.com/YNWAforever/hkscda.git` |
| Working checkout | `C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda` | `git rev-parse --show-toplevel` |
| Working branch | `feat/hkscda-six-phase-revision` | created from `origin/main` in this session |
| Branch base / current HEAD | `c037cc12b299058e2699b126c38322b59406e6ea` | `git rev-parse HEAD` |
| `origin/main` at session start | `c037cc12b299058e2699b126c38322b59406e6ea` | `git fetch origin --prune` then `git log origin/main` |
| Local `main` before fetch | `20c168459a90c5c92093659a18b139a994451470` (29 behind) | `git rev-list --count main..origin/main` = 29 |
| Uncommitted changes at start | none | `git status --porcelain` → empty |

**The audited revision and the current `origin/main` are the same commit.**
The master plan names `c037cc12b299058e2699b126c38322b59406e6ea` as the audited
source revision, and `origin/main` is at exactly that commit. No commits have
landed on `main` since the audit, so the audit baseline has not been overtaken by
newer work on the default branch.

Other people's in-flight work **does** exist off `main`: 40+ remote branches and
38 local worktrees under `.worktrees/`. None were modified in this session.

## 2. Deployment correspondence (resolves an audit caveat)

The audit stated it "was not independently established that the deployment at the
time necessarily matched this commit." This session established it.

| Fact | Verified value | How |
|---|---|---|
| Vercel project / scope | `hkscda` / `ynwaforevers-projects` | Vercel API `list_deployments` |
| Current production deployment | `dpl_8jCLNvV4KgkFPdYpMPoinb225UqS` | state `READY`, `target: production` |
| Deployed commit | `c037cc12b299058e2699b126c38322b59406e6ea` | deployment `meta.githubCommitSha` |
| Deployed branch | `main` | deployment `meta.githubCommitRef` |

**Production is deployed from the audited revision.** Source-level findings at
this commit therefore describe what is actually running, subject to the separate
question of database schema drift (below).

Also observed: every feature-branch push in this project produces a Vercel
preview deployment (`target: null`). `vercel.json` disables deployments only for
`feat/public-layout-v2`, `feat/layout-*`, `chore/layout-*`, `fix/layout-*`,
`ci/layout-*`, and `docs/brand-reconciliation`. A branch outside those patterns
**will** produce a preview on push — relevant to AGENTS.md's instruction not to
create a public preview while review access is meant to remain private.

## 3. Database project

| Fact | Verified value | How |
|---|---|---|
| Supabase project ref | `iihqjzilgawhfdhdevam` | `AGENTS.md` and `.env.local` `VITE_SUPABASE_URL` agree |
| Local `.env.local` target | the **production** project | same ref as above |
| Local stack config | `supabase/config.toml`, `project_id = "hkscda"`, API port `55321` | file read |
| Local stack running at session start | no | `docker ps` showed no `hkscda` containers; port 55321 free |

**Consequence recorded as a working rule:** `.env.local` in this checkout points
at the production database. No migration, seed, reset or write rehearsal is run
against it. Isolated rehearsal uses a local Supabase stack on port 55321.

## 4. Repository gates — actual commands and results

Environment: Windows 11, Bun 1.3.14 (matches the version CI pins in
`.github/workflows/ci.yml`), Node v24.18.0, Docker 29.7.2.
Commit under test: `c037cc1`.

| Gate | Command | Exit | Result |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | 0 | 100 packages installed |
| Typecheck | `bunx tsc --noEmit` | 0 | no diagnostics |
| Test | `bun test` | 0 | **1969 pass, 86 skip, 0 fail**, 6020 expect() calls, 2055 tests across 322 files, 57.85s |
| Lint | `bun run lint` | 0 | **0 errors, 40 warnings** (all `react-refresh/only-export-components`) |
| Build | `bun run build` | 0 | built in 1m19s; `.vercel/output` generated |

`bun run test:rls` — **Blocked at the time of this record**: requires a local
Supabase stack reachable at `http://127.0.0.1:55321`; the harness
(`supabase/rls-tests/moneyPii.rls.test.ts`) skips itself when the stack is
unreachable rather than failing. Being started separately in this session.

`bun run verify:brand` / `verify:a11y` / `verify:performance` — require a built
app and a reachable origin; not yet run at the time of this record.

### 4.1 Two environment defects found and corrected — neither is a repo defect

Both initially made the gates look broken. Recording them so the same false
signal is not re-diagnosed as a code problem later.

1. **`web-vitals` absent from `node_modules`.** `bunx tsc --noEmit` reported 3
   × `TS2307: Cannot find module 'web-vitals'`, and `bun test` reported 1 failing
   test. The package **is** declared in `package.json` (`"web-vitals": "5.1.0"`)
   and pinned in `bun.lock`; it was simply not installed in this checkout.
   `bun install --frozen-lockfile` resolved both. No package was upgraded or
   downgraded, and no source file was changed.

2. **CRLF in 24 working-tree files.** `bun run lint` reported 1070 problems, of
   which 1030 were `prettier/prettier` "Delete `␍`". `.gitattributes` already
   declares `* text=auto eol=lf` and documents this exact failure mode. The
   stored git blobs are LF-clean (`git cat-file -p origin/main:<file> | grep -c
   $'\r'` → 0); only the materialised working files carried CR, so `git status`
   was clean because the clean filter normalises on read. Stripping CR in place
   restored a byte-identical working tree (`git diff --numstat` → empty) and lint
   went to 0 errors. **No repository content was changed**, and this correction is
   not part of any commit.

## 5. Phase 1 finding confirmed at source level

The four migrations the master plan lists as "objects missing at audit time" are
all **present in the repository** at this commit:

- `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`
- `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- `supabase/migrations/20260906162436_animal_catalog_membership.sql`
- `supabase/migrations/20260906181657_animal_public_profile.sql`

54 migration files exist in total. Because production runs this exact commit and
these migrations are committed, the audit's observation that the corresponding
database objects were absent points to **migrations not applied to the deployed
Supabase project** — deployment/schema drift — rather than missing source. This
session has **not** queried the production database, so the drift itself is
recorded here as the audit's finding, not as an independently reverified fact.

## 6. Required working records

None of the five records required by master plan §15.1 existed at `c037cc1`:

- `docs/superpowers/plans/hkscda-implementation-status.md` — missing
- `docs/superpowers/specs/hkscda-data-and-api-contracts.md` — missing
- `docs/superpowers/specs/hkscda-volunteer-policy-decisions.md` — missing
- `docs/superpowers/plans/hkscda-migration-and-release.md` — missing
- `docs/evidence/hkscda-revision/` — missing (created by this file)

## 7. Production-write guard on the animal importer — verified behaviour

`scripts/import-hkscda-animals.js`, exposed as `bun run import:hkscda`, built a
service_role Supabase client from `VITE_SUPABASE_URL` with **no project-ref
check**. It reads `.env` / `.env.local`, and `.env.local` in this checkout points
at the production project, so a single command would have written scraped animal
rows and public storage objects over real animal records.

`seed-admin.js` already exported a tested guard for exactly this
(`isProductionProjectRef`, covered by `scripts/seed-admin.test.ts`). It is now
imported rather than re-declared, so the project ref is defined once.

Verified by running the script directly:

| Target | Command | Result |
|---|---|---|
| Production ref | `VITE_SUPABASE_URL=https://iihqjzilgawhfdhdevam.supabase.co node scripts/import-hkscda-animals.js` | exit 1, "Refusing to run against the production Supabase project", **before** any client is created |
| Local stack | `VITE_SUPABASE_URL=http://127.0.0.1:55321 node scripts/import-hkscda-animals.js` | passes the guard, proceeds, then exits 1 on the genuinely missing `data/hkscda-animals.json` |

Fails closed for production, open for local — the importer remains usable.

### Flagged, not changed

`scripts/import-adoption-guide-drafts.mjs` also builds a service_role client with
no project-ref guard. It was **not** blocked here: unlike the animal importer it
requires an explicit `--apply` flag plus `ADOPTION_GUIDE_IMPORT_ACTOR_ID`, and it
creates content *drafts* rather than overwriting master records, so running it
against production may be a legitimate authoring workflow. Whether it should
require a typed confirmation is an owner decision, recorded here rather than
decided unilaterally.
