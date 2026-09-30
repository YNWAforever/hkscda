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


## PR169 preparation — 2026-09-30

PR169 current application b918ff918c98a2188335465237a6add66abfd0c7:3065pass137skip0fail9587assert552files32.75s;typecheck0/lint0(52warnings)/build0;isolated service_role4tests24assert0;exact fullmigration2row8.59ms rollback0;three-width12casebrowser0. RemoteCI pending. See sequential-merge-169-20260930.md.


## PR170 preparation — 2026-09-30

PR170 a50a09f581f7862ebf9ba2fdde53d58cdf65a307:full3074pass141skip0fail9628assert556files19.97s;typecheck/build0;lint52warnings0beforecatalog-onlyintegration;DB4tests22assert275ms;fullSQL2oldrows12.19ms/1000preview51.41ms/900apply948.87ms;rollback0. See sequential-merge-170-20260930.md.


## PR171 preparation — 2026-09-30

PR171 7136ad049c536fe27fcc4823066d762c618b2c9b:10focused46assert;full3084pass141skip0fail9676assert559files33.49s;typecheck/lint0(52warnings)/build0;3width15casebrowser0. Originalcancelstaledraft1ateachwidthred1;fixedstale0. See sequential-merge-171-20260930.md.


## PR172 current preparation — 2026-09-30

See [sequential-merge-172-20260930.md](sequential-merge-172-20260930.md) for finalapp `0af5599648949238d1244a7625b22d0f50baa35f`, four reproduced fixes,16focused/56assertions,3099full passes/142skips, type/lint/build0, service_role/fullSQL rehearsal,3width before/after UI and exact release boundaries.57-file inventory; codecomplete/local-schema-ready,notdeployed/notenabled. Sequential release remains blocked at#156.


## PR173 current preparation — 2026-09-30

See [sequential-merge-173-20260930.md](sequential-merge-173-20260930.md): app `40a8765beaa04613fae1f9cc77e74a11d34810f1`, rejected-retry/lost-response/page1000/keyboard fixes;17focused/88assertions,3110fullpasses143skips,type/lint/build0; real concurrent one-audit retry and1000job pagination;3width UI/Axe0.58-fileinventory,local-schema-ready,notdeployed/notenabled;#156releaseblock retained.


## PR174 current preparation — 2026-09-30

See [sequential-merge-174-20260930.md](sequential-merge-174-20260930.md): app `ea7541079ca3cd3c0390f9f3bef1a8665b4746f2`, treasury guidance corrected without permission expansion. Full3113pass143skip9802assertions;type/lint/build0;actualisolatedAuth/API3roles;9browsercases/Axe0,12screenshots.58inheritedSQLfiles,no newmigration. Codecomplete slice,notdeployed/notenabled;#156remains releaseblock. #172fivegreen andexactapprovalrequested;#173CIpending.


## PR175 current preparation — 2026-09-30

See [sequential-merge-175-20260930.md](sequential-merge-175-20260930.md): app `04d673b8ef64d690ed75bf47cdc0175aefed5b02`, serialized/actor-scoped snapshotrecovery andpaginationfixes. Full3125pass145skip9862assertions;19focused86assertions;type/lint/build0withexplicitfinal-counterclarificationboundary;1000syntheticresult897success100skip3conflict/auditrollback;12browsercases/Axe0.59-fileinventory;local-schema-ready,notdeployed/notenabled. #172–#174fivegreen;#156releaseblockretained.


## PR176 current preparation — 2026-09-30

See [sequential-merge-176-20260930.md](sequential-merge-176-20260930.md): app `82c62c7a46994f12f413b946d099a6e7a8bc263b`, stale response/invalid JSON/keyboard fixes. Full 3136 pass / 145 skip; 13 focused / 52 assertions; typecheck/lint/build exit 0. Actual isolated Auth/PostgREST 1000-selection role/read-only verification and three-width before/after UI, Axe0. No new SQL; 59 inherited migration files. Code-complete slice, not deployed or enabled; #156 release blocker remains. #175 exact-head five gates green.


## PR177 current preparation — 2026-09-30

See [sequential-merge-177-20260930.md](sequential-merge-177-20260930.md): app `c75ea7510cdd86c9b0489de7dd3ced78d7e2dac9`. Production version fence is already provided by149; duplicate177DDL reproduced42701 and replaced with narrow direct-EXECUTE revoke.15-row preservation/grant/trigger rehearsal0;5focused101assertions;full3140pass141skip;type/lint/build0.60-file manifest. Grant change not applied in production. #161 single migration approval received; ordered release remains blocked at156.


## PR178 current preparation — 2026-09-30

See [sequential-merge-178-20260930.md](sequential-merge-178-20260930.md): app `79838107c738854a28ac5a977b0e9fa6c3c6f5c2`, direct-column privilege bypass and recovery/live-actor races repaired. Full3159pass145skip10026assertions; typecheck/lint/build0; actual role DB5pass31assertions; exact SQL preserves15rows and reports898success101skip1conflict for1000items with audit rollback/retry;12browsercases/Axe0 and six before/after screenshots.61-file inventory; exact approval awaits five current-head CI gates. Code-complete/local-schema-ready, not deployed or enabled; #156 ordered-release blocker retained. Shared actor fix is backported separately to175.


## PR179 integrated preparation — 2026-09-30

App `c0da836ee5f3e3a47bd2d61f4cb83d7e52ec436a` integrates through178 and the focused wizard removal/tray fix. Typecheck/lint/build0;full3155pass150skip9996assertions;actual built before/after keyboard/client-navigation/sponsor-preservation proof at390/768/1440,afterAxe0/overflow0/errors0. Single same-host CLS samples and six hashes are in [sequential-merge-179-20260930.md](sequential-merge-179-20260930.md); no hosted or full-submit claim.61 inherited SQL files,no new migration.175 actor followup source is identical and its evidence is carried forward;178 five gatesgreen and exactapprovalrequested.22/46merged;156actualproviderfailure stillblocks orderedrelease. Formal terms/content/retention/identities/provider/notification and exactschema approvals remain external.
