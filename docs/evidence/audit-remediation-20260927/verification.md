# T00–T02 verification (2026-09-27 HKT)

Checkout base and production alias SHA: `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. Worktree branch: `codex/audit-remediation-20260927`. Code commits: `da9967a` (schema checker) and `9854087` (public submission safety). The after-browser measurement ran on the matching dirty working tree before these commits; no code edits followed until they were committed. No production write or public preview.

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Isolated worktree | `bun test src/lib/operations/releaseSchema.test.ts src/lib/operations/releaseManifest.test.ts` | 0 | 10 pass; synthetic catalog |
| Isolated worktree | `bun test src/lib/adoptionInformation/publicPage.server.client.test.ts` | 0 | 12 pass; #133 matrix |
| Isolated worktree | T02 public-form/API/security targeted Bun suites | 0 | 73 pass |
| Dedicated local stack, unlinked `127.0.0.1:57322` | Fresh 143 migrations + `bun scripts/check-release-schema.ts` | 0 | 67 requirements, 0 issues |
| Same stack reset to `20260914164558`, no seed | `bunx supabase migration up --workdir node_modules/.audit-remediation-rehearsal --local` | 0 | 34 migrations, ledger 109 to 143 |
| Same upgraded stack | `bun scripts/check-release-schema.ts` | 0 | compatible, 67 requirements, 0 issues |
| Same upgraded stack with synthetic role fixtures | `bun run test:rls` | 0 | 50 pass, 0 fail |
| Same upgraded stack | `bun test --isolate` | 0 | 2787 pass, 83 skip, 0 fail, 468 files |
| Isolated worktree | `bun run typecheck` | 0 | strict `tsc --noEmit` |
| Isolated worktree | `bun run lint` | 0 | 0 errors, 52 existing warnings |
| Isolated worktree | `bun run build` | 0 | Vercel output generated; separate from typecheck |
| Shared older local stack | `bun test --isolate` | 1 | 6 existing RLS failures against older schema; diagnostic only; all three failing test files passed 48/48 on dedicated upgraded stack |
| Read-only synthetic fixture and built preview | `bun run verify:brand` | 0 | 26 routes × 5 viewports |
| Same fixture and preview | `bun run verify:a11y` | 0 | 26 routes × 1 viewport |
| Same fixture and preview | `bun run verify:performance` | 0 | 4 routes × 2 viewports × 3 cold runs; see `performance-runs.csv` |
| Same fixture, clean production-SHA baseline preview | `bun run verify:performance` | 0 | 24 comparable cold runs; see `performance-comparison.csv` |
| Provider sandbox / data-bearing DB | payment, concurrent retry, backup and rollback rehearsal | not-run | later tasks and external test inputs |

Tests use synthetic fixture identities and local demo keys. The compatibility script only performs SELECT queries; it never applies migrations. Production catalog remains missing the audited objects. This record does not mark the release deployable.

## T18 content eligibility (2026-09-27 HKT)

Isolated worktree codex/audit-content-eligibility-20260927; dedicated synthetic Supabase stack REST 127.0.0.1:57321, DB 127.0.0.1:57322. Schema rehearsal and fixture writes were confined to that stack and rollback transactions.

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Dedicated isolated DB | bun test src/lib/content/publicationEligibility.integration.test.ts with CMS_LIFECYCLE_TEST_DATABASE_URL and local fixture flag | 0 | 1 pass, 13 assertions; metadata audit, eligibility, grants and public profile validation |
| Isolated worktree | SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test | 0 | 2,821 pass, 84 skip, 0 fail; before final archived-card follow-up |
| Isolated worktree | bun test src/components/site/stories/StoryContentGrid.test.tsx | 1 then 0 | Red reproduces expired registration CTA; green 1 pass, 5 assertions |
| Isolated worktree | npm.cmd run typecheck | 0 | Strict TypeScript; before final archived-card follow-up |
| Isolated worktree | npm.cmd run lint | 0 | 0 errors, 52 existing warnings; before final archived-card follow-up |
| Isolated worktree | npm.cmd run build | 0 | Client/server output; before final archived-card follow-up |
| Local Chromium/Edge | Playwright browser visual acceptance | not-run | Browser launch timed out (180s Chromium, 20s Edge); desktop helper sandbox ACL failure |
| Production public API | GET /api/stories?page=1&pageSize=50 | 0 | Read-only 7 exact demo-label candidates; no classification change |
| Production content/catalog | migration, classification, upload, provider/payment/email | not-run | Awaiting owner and release approvals |

The subsequent full-suite, lint, typecheck and build checks for the final source tree appear below.

### T18 final source tree after archived-card fix

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Isolated worktree + dedicated stack | SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test | 0 | 2,822 pass, 84 skip, 0 fail, 8,597 assertions, 2,906 tests across 476 files |
| Isolated worktree | npm.cmd run typecheck | 0 | Strict TypeScript |
| Isolated worktree | npm.cmd run lint | 0 | 0 errors, 52 existing warnings |
| Isolated worktree | npm.cmd run build | 0 | Vercel client/server output built |


## T19 media repair (2026-09-27 HKT)

Environment: isolated worktree codex/audit-media-repair-20260927; disposable Supabase DB 127.0.0.1:57322 and REST 127.0.0.1:57321. No production mutation.

| Command | Exit | Result |
|---|---:|---|
| bun test src/lib/animals/publicationMediaRepair.database.test.ts src/lib/content/publicationMediaRepair.database.test.ts with MEDIA_REPAIR_TEST_DATABASE_URL and local fixture flag | 0 | 2 pass, 450 assertions; rollback-only DB fixtures |
| CHECK_RELEASE_SCHEMA_DATABASE_URL=local DB bun scripts/check-release-schema.ts | 0 | compatible, 84 requirements, zero issues |
| SUPABASE_LOCAL_URL=local REST bun test | 0 | 2,828 pass, 86 skip, 0 fail, 8,674 assertions across 481 files |
| npm.cmd run typecheck | 0 | strict TypeScript |
| npm.cmd run lint | 0 | 0 errors, 52 existing warnings |
| npm.cmd run build | 0 | Vercel client/server output built; separate from typecheck |
| Browser UI and production media worker | not-run | Browser helper unavailable; no production schedule or copy |


## T20/T21 region and public animal pagination (2026-09-27 HKT)

T20 production metadata read-only: Vercel deployment dpl_Ggm7uaMZXqFFw7yqZyE7z8D3zg5m region iad1 and Supabase project ap-southeast-1 confirmed. Private same-SHA region candidate, cold/warm geographic benchmark and region switch: not-run.

| Environment and command | Exit | Result |
|---|---:|---|
| Loopback DB, PUBLIC_LISTING_TEST_DATABASE_URL + local fixture flag, bun test src/lib/animals/publicListing.database.test.ts | 0 | 1 pass, 20 assertions; 1k/10k parity, anon RLS, sponsor/birthday, rollback-only |
| Loopback DB, PUBLIC_LISTING_BENCH_DATABASE_URL + local fixture flag, bun scripts/bench-public-listing.ts | 0 | 30 warm samples; see t21-public-pagination.md |
| Loopback DB, CHECK_RELEASE_SCHEMA_DATABASE_URL, bun scripts/check-release-schema.ts | 0 | 86 compatible requirements, zero issues |
| bun test src/lib/animals/publicListing.server.test.ts src/lib/animals/publicAnimal.functions.test.ts | 0 | 3 pass; one-RPC adapter and detail-gallery compatibility |
| bun test src/lib/animals/publicImageSources.test.ts src/components/site/AnimalCard.test.tsx | 0 | 7 pass; public-only variants and image layout |
| SUPABASE_LOCAL_URL=loopback REST bun test | 0 | 2,829 pass, 87 skip, 0 fail, 8,692 assertions across 483 files |
| npm.cmd run typecheck | 0 | strict TypeScript |
| npm.cmd run lint | 0 | 0 errors, 52 existing warnings; first run exposed CRLF and was fixed |
| npm.cmd run build | 0 | Vercel client/server output built; separate from typecheck |
| node --test scripts/ci/supabase-fixture.test.mjs | 0 | new RPC fixture returns valid second page and no notes |
| Browser/paid transform/private preview | not-run | T18 browser launcher failure and external provider/preview gates |

### T21 CI fixture correction on PR #155

Initial GitHub Actions run 36329614637: verify, RLS matrix and performance passed; brand and a11y failed because public animal detail routes returned 404. A red fixture HTTP test reproduced 406 for the real published/id/status-in/retired-null/eligibility query. The fixture's in(...) parser retained parentheses, and its is.null predicate was absent. Both were corrected; node --test scripts/ci/supabase-fixture.test.mjs exits 0. GitHub Actions rerun 36331436408 at head 71580ed: verify, RLS matrix, performance, brand and a11y all passed. This verifies the fixture build, not a deployed production schema or same-region browser benchmark.

## T22 supporter recovery first PR (2026-09-28 HKT)

Environment: isolated worktree codex/audit-supporter-recovery-20260927; dedicated loopback REST 127.0.0.1:57321. No production data or email send.

| Command | Exit | Result |
|---|---:|---|
| bun test src/lib/supporters src/routes/api/supporter src/routes/supporter.test.tsx | 0 | 9 pass, 4 DB-gated skip, 0 fail |
| SUPABASE_LOCAL_URL=loopback REST bun test | 0 | 2,836 pass, 87 skip, 0 fail, 8,713 assertions; first attempt failed on fixture timeout, base correction then rerun passed |
| npm.cmd run typecheck | 0 | strict TypeScript after generated route update |
| npm.cmd run lint | 0 | 0 errors, 52 existing warnings |
| npm.cmd run build | 0 | Vercel client/server output built |
| Provider OTP delivery, expiry/replay, hosted Auth settings | not-run | Disposable auth stack lacks email test sink; no real email sent |

## T22 supporter portal second PR (2026-09-28 HKT)

- Worktree: audit-supporter-portal-20260928; base recovery #156 at 3e6b681. Source commit and PR pending at this evidence capture.
- Reproduced red tests: ownership projection exposed two mismatched/legacy sponsorship snapshots, and the preference UI lacked explicit opt-in/out controls. Both passed after minimal edits.
- Focused tests: bun test src/lib/supporters/portalRepository.server.test.ts src/components/site/supporter/SupporterPortal.test.tsx, exit 0, 2 pass. Direct records/receipt/preference handler and owner tests passed in full suite.
- Disposable SQL: SUPPORTER_PORTAL_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres, SUPPORTER_PORTAL_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/supporters/marketingPreference.database.test.ts src/lib/operations/releaseManifest.test.ts, exit 0, 3 pass. Fixture inserts rolled back. Wrong email, unconfirmed and banned user were denied; unchanged preference inserted no duplicate consent/audit. No production DB was touched.
- CHECK_RELEASE_SCHEMA_DATABASE_URL on loopback 57322 bun scripts/check-release-schema.ts, exit 0, 87 requirements, zero issues. Latest local ledger reports 20260927150000; portal function was manually applied on the disposable stack without writing a ledger row. This is an object check, not a full ordered migration replay.
- SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate, exit 0, 2844 pass, 89 skip, 0 fail across 494 files. npm.cmd run typecheck, npm.cmd run lint, npm.cmd run build all exit 0; lint 52 warnings, 0 errors. Real OTP email sink, expiry/replay, browser session and private receipt download remain not-run.

## T23 role task overview slice (2026-09-28 HKT)

- Source branch: codex/audit-task-overview-20260928, stacked on T22 portal ef59ca3. PR/source commit pending at capture.
- Red before implementation: task overview imports absent; role-specific 3-5 cards, unknown-vs-zero, direct API 401 and static UI tests later passed 4/4.
- Dedicated unlinked PostgREST at 127.0.0.1:57321: all 11 task count queries executed read-only with a local service key kept out of logs; 1 pass, 22 assertions. No synthetic write or production connection.
- npm.cmd run typecheck exit 0; npm.cmd run lint exit 0 with 52 existing warnings and no errors; npm.cmd run build exit 0.
- Concurrent build + full bun test --isolate: 2848 pass, 90 skip, 1 fail: unrelated migration-safety scan exceeded Bun's 5-second test timeout at 6112 ms. The targeted scan alone passed 1/1 in 109 ms. Repeating the full suite alone exited 0: 2849 pass, 90 skip, 0 fail across 498 files.
- Browser with real role identities, exact filter-preserving links, schema/worker readiness, and bulk mutation UAT are not-run / open.

## T23 sponsorship follow-up source #169

Source `05bb6f1b64fbf39c8f40944b27f446a38751e809`: `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` exit 0, 2910 pass/109 skip/0 fail/9057 assertions across 523 files. The first concurrent gate run had one 5-second RLS setup timeout; the same RLS file passed 39/39 alone, then the sequential full suite passed. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` each exited 0. Dedicated 127.0.0.1:57322 sponsorship database tests exited 0, 3 pass/20 assertions including direct authenticated UPDATE denial and two-connection one-winner/one-audit; final exact migration file BEGIN/ROLLBACK succeeded. Local release catalog check exited 0 with 119 compatible requirements and no issues, with no forged ledger row. Remote source CI `36360874161` passed all five jobs. See `t23-sponsorship-followup.md`. Hosted staff browser, same-SHA private preview, 47-file fresh/data-bearing rehearsal and release approval remain not-run.
## T23 sponsorship follow-up bulk source #170

Source `74669a48a7786f93cde5ebb4dd0118490f24a095`: `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with dedicated bulk DB fixture enabled exited 0 (2918 pass/109 skip/0 fail/9109 assertions across 526 files), before a final test-only competing-preview assertion. That DB file then passed 3/19 focused. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` each exited 0. Catalog checker on 57322 exited 0 with 124 compatible/zero issues; ledger unchanged. API checkpoint 2/13, selection 2/6 and role UI 5/10 focused passed. Exact SQL BEGIN/ROLLBACK passed. See `t23-sponsorship-bulk.md`. Hosted identity/browser, 48-file fresh/data-bearing upgrade, same-environment performance and production approval are not-run.

Remote source CI run `36364156675` at `74669a4` passed all five jobs (verify, RLS matrix, brand, a11y, performance). This fixture CI does not substitute for hosted staff-session UAT.

## T23 sponsorship reminder draft source #171

Source `c683532b9f8539836f032a31fa17aa8c2a8494a8`: red absent-module/route/UI tests preceded the minimal read-only draft implementation. Focused 9 pass/38 assertions. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with existing loopback bulk DB fixture enabled exited 0: 2927 pass/109 skip/0 fail/9149 assertions across 529 files. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` each exited 0 after route generation. No new SQL; the prior 48-file schema manifest is unchanged. Direct route factory tests deny unauthenticated/treasurer requests before private reads, and assert no-store, invalid ID, missing row and POST refusal. See `t23-sponsorship-reminder.md`. Hosted real-role API/browser, same-environment before/after UI/performance, approved wording and send sandbox are not-run.

Remote source CI run `36367078505` at `c683532` passed all five jobs (verify, RLS matrix, brand, a11y, performance). This fixture CI does not replace hosted staff-session UAT.

## T23 bank statement dry-run source #172

Source `620790d8ffb50618f15911c23bd4bf803247c4c7`: parser/service/API/UI focused tests 11 pass/42 assertions; rollback-only synthetic DB test on 127.0.0.1:57322 1 pass/8. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with local sponsorship bulk and bank dry-run DB fixture flags: 2939 pass/109 skip/0 fail/9202 assertions across 534 files, exit 0. `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`: exit 0 each. Exact SQL BEGIN/ROLLBACK exit 0; local catalog 125 compatible/zero issues, active local ledger still 20260927150000. See `t23-finance-bank-dryrun.md`. Hosted finance roles/private browser, bank-specific adapter, group confirmation, provider sandbox, 49-file sanitized data-bearing upgrade and release approval remain not-run.
Remote source CI run 36369763776 at 620790d passed all five jobs (verify, RLS matrix, brand, a11y, performance).

#172 fresh disposable stack on unique 5832x ports: `bunx supabase start --workdir node_modules/.audit-fresh-172 --exclude realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor` exit 0, all 158 repository migrations applied through 20260928090000 with 158 real local ledger entries. `CHECK_RELEASE_SCHEMA_DATABASE_URL` on 127.0.0.1:58322: exit 0, 125 compatible/zero issues. Sanitized data-bearing upgrade and production comparison remain not-run.
#172 separate synthetic 109-to-158 ledger upgrade on 127.0.0.1:59322: baseline `supabase start` exit 0, two synthetic payments committed, `supabase migration up --local` for 49 later files exit 0; final real ledger 158/`20260928090000`, catalog 125 compatible/zero issues and synthetic facts 2 total/1 credited/1 pending preserved. Sanitized production-like clone timing and backup/restore remain not-run.

## T23 failed finance delivery jobs source #173

Source `732fd5cdc0175de5c6623d1b836b07f560efc348`: red rollback-only DB tests reproduced banned treasurer retry and missing DB-guarded worklist; red repository and task tests caught direct service-table read and omitted retryable metric. Focused repository/API/UI/task/DB 10 pass/60 assertions, exit 0. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with dedicated loopback DB flags: 2947 pass/109 skip/0 fail/9250 assertions across 540 files, exit 0. `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet` each exit 0. Exact SQL BEGIN/ROLLBACK and manual application only on 57322, no ledger edit; local catalog 127 compatible/zero issues. See `t23-finance-delivery-worklist.md`. Source CI run 36373635875 at 732fd5c passed verify, RLS matrix, brand, a11y and performance, exit 0. Hosted finance roles/private API, mobile/keyboard, email sink, concurrent worker, sanitized data-bearing clone and release approval remain not-run.

#173 final fresh 159-file rebuild on unique 6032x stack exited 0; real ledger 159/`20260928100000`, checker 127 compatible/zero issues. Separate 6232x stack applied the 109-file observed baseline, inserted two synthetic payments (one credited) and one failed delivery job, then applied all 50 later final files through 159, exit 0. Payments and failed job survived; checker 127 compatible/zero issues. Sanitized production-like clone, lock timing and backup/restore remain not-run.

## T23 role-guided task entry #174

Source `8f62d8a4ccd52803ebb8aea6929b8e9e7ee901ab`: red tests confirmed absent guidance and ordered list; focused API/server/UI 6 pass/34 assertions, exit 0. Final full isolated local 57321/57322 suite 2949 pass/109 skip/0 fail/9259 assertions across 540 files, exit 0. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`: exit 0 each. No migration or DB write. CI run 36375345907 passed all five jobs. Hosted staff/treasurer/admin identities, mobile/keyboard screenshot UAT and release approval remain not-run. See `t23-role-guidance.md`.

## T23 bank match confirmation #175

Runtime source 6ecadd0ee45be39e129a17c0572c07f5b5fe43eb, concurrency-test commit 1f779ccb7de0cac6e465a28a8db06ea11ba24d06, payment-hint fix head f9e3e00f5cd20cee984404b04adc5b0541deca88. Red missing-RPC test 42883, then green isolated DB tests 2 pass/23 assertions on 57322, including committed synthetic two-request race: one success, one conflict, one payment audit/job and idempotent replay. Full bun test with SUPABASE_LOCAL_URL 57321 and bank fixture URL 57322: exit 0, 2954 pass/114 skip/0 fail/9292 assertions across 545 files. Initial default-port 55321 run: exit 1, six RLS failures; affected suites rerun on named 57321 stack: 48 pass/0 fail. Typecheck, lint and build each exit 0; lint has 52 existing warnings. Exact SQL checksum e573522db17514869a39a62b090573ec458e1a5553cada3b8ef153b228cc6273. Fresh 6032x reset and new separate synthetic 6332x 109-to-160 migration up each exit 0, real ledger 160/20260928110000, catalog 132 compatible/zero issues, two synthetic payments and one job preserved on upgrade. No production action. Earlier CI 36378634301 and 36379404110 each passed all five jobs; final hint-fix source head CI 36381052422 passed verify, RLS, brand, a11y and performance; evidence-head CI 36382517123 passed all five jobs.

Read-only production recheck on 2026-09-28: 79 ledger versions through 20260914164558; all 8 reaudit-minimum tables, 14 RPC names and fingerprint column remain missing. The exact repository comparator against filtered catalog metadata reported state incompatible, 132 requirements, 126 required issues (26 missing tables, 79 missing functions, 21 missing columns); the metadata-only runner exited 0, which is not a release pass. Local source has 109 files through that version, with 51 source-only and 21 live-only versions. This invalidates treating the synthetic 109-to-160 upgrade as the live migration path; see `production-catalog-recheck-20260928.md`. No production rows or DDL were touched.

## T23 CRM contact format preview #176

Source 1511ee99bdaad0b814e82ce8a259a68632f9b7bf in isolated worktree audit-crm-format-preview-20260928, based on #175 evidence b5e1600. Missing service/route red `bun test src/lib/crm/contactFormatPreview.test.ts src/routes/api/admin/supporters/format-preview.test.ts`: exit 1, two missing-module errors. Green focused command including SupporterList.test.tsx: exit 0, 9 pass/40 assertions. The route denies an unauthorized direct API call before any PII read, rejects duplicate and 1001 IDs, accepts 25 and 1000, returns ordered/redacted missing or deleted results, and uses no-store with sanitized failures. No real supporter rows were read.

Full `bun test --isolate` on named local Supabase API 127.0.0.1:57321 and DB 57322 with synthetic bank fixture: exit 0, 2961 pass/114 skip/0 fail/9330 assertions across 547 files. `npm.cmd run build`: exit 0 and generated src/routeTree.gen.ts. Final `npm.cmd run typecheck`: exit 0; initial pre-build exit 1 only on missing generated route type. Final `npm.cmd run lint -- --quiet`: exit 0; initial pre-format exit 1 only on touched-file Prettier errors. Remote source CI run 36384803921 and evidence-head CI 36385940223 each passed verify, RLS, brand, a11y and performance. Hosted treasurer/admin/browser/mobile/keyboard and same-environment performance: not-run. No DB migration or production operation.


## T23 CRM tag bulk fresh-schema version fence #177

Source 8fd9310237e3ba94f91352f3ea713d1f012ac61b. Fresh 60322 rollback-only CRM DB fixture exited 1 with PostgreSQL 42703 and 0 pass/2 fail before the column existed; release manifest unit test also exited 1 before its required-column entry. Exact migration transaction rehearsal exited 0; corrected 60322 fixture exited 0 with 2 pass/16 assertions. Separate seed-disabled 6432x fresh install exited 0 with real 161-version ledger and 133 catalog requirements compatible/zero issues; its CRM fixture exited 0 with 2 pass/16 assertions. Unlinked 6332x synthetic 160-to-161 migration-up exited 0, preserved two synthetic payments and one failed delivery job and passed 133 catalog requirements. Full named 57321/57322 bun test --isolate exited 0: 2963 pass/112 skip/0 fail/9347 assertions across 547 files. Typecheck, quiet lint and build exited 0 separately. Source CI 36388704067 and evidence-head CI 36389895803 passed five jobs each; hosted real-role and production migration tests not-run. See t23-crm-version-fence.md.

## T23 CRM assignment bulk #178

Source a3dc126024267015a17939d6c5cd3715bbcce1f0. Red schema/route/picker/manifest tests preceded implementation. Local 57322 isolated fixture: 6 focused schema/behavior/API pass/38 assertions; a separate two-connection test passed with one winner, one conflict and one audit. Final named 57321/57322 full bun test --isolate exit 0: 2970 pass/112 skip/0 fail/9405 assertions across 552 files. bun run typecheck, bun run lint -- --quiet and bun run build each exit 0. Exact local SQL pieces passed transaction dry runs. Unlinked fresh 64322 and synthetic upgrade 63322 used real Supabase migration up to ledger 162, both catalog checks exit 0 with 140 compatible/zero issues; two payment rows and one delivery job hashes unchanged. Saved read-only production snapshot against 140 requirements is incompatible with 134 missing entries (28 tables, 83 functions, 23 columns). Source CI 36394352630 and evidence-head CI 36395704420 each passed verify, RLS, brand, a11y and performance. Hosted actual-role, private candidate and production bridge tests not-run. See t23-crm-assignment-bulk.md.

## T24 combined local integration candidate

Source 9130cb846d7a876e0c867c1dddd1fcc33aa0c6ce, local-only. Two fresh seed-disabled 170-migration stacks on 52322 and 57322 each passed 145 catalog requirements with zero issues; the 57322 real ledger has 170 rows through 20260928120000. bun run build, bun run typecheck, bun run lint -- --quiet each exited 0. bun test --isolate --parallel=1 --timeout=60000 with named loopback DB fixtures exited 0: 3075 pass, 110 skip, zero fail, 9793 assertions across 574 files. Default parallelism previously timed out in three DB cases; focused reruns passed 7/7, then serial full suite passed. Integrated remote CI, real-role browser/private-file UAT, provider sandbox, sanitized live-ledger upgrade and production migration are not-run. See integration-candidate-20260928.md.

## SEC-01 / T07 regression recheck

The combined local source already contains the T02 fail-closed limiter/Turnstile and #139 T07 proof-token normalization. A seven-file `bun test` batch without isolation exited 1 because `PledgeWizard.test.tsx` installed a process-global `@tanstack/react-router` mock that removed `createFileRoute` for the later proof route tests. The proof route file alone exited 0 (7 pass/19 assertions), and `bun test --isolate` across all seven files exited 0 (71 pass/161 assertions). Source code mitigation is recorded as code-complete; production site-key/secret metadata, actual challenge behavior, deployment and operational enablement remain unverified. No secret value was read or printed.