# PR176 sequential release preparation — 2026-09-30

## Scope and release status

Application `82c62c7a46994f12f413b946d099a6e7a8bc263b`; integrated baseline `30e0b6c522f74da3773f7043fdeb0573731728eb`; predecessor #175 `be48494242d3b001bbe1d2e31338fc504d88471d`. Read-only CRM contact format suggestions, with email changes requiring manual identity review. No apply action, consent update, identity merge, notification or schema change.

Code-complete for this slice; schema-ready: no new SQL, existing supporter/Auth dependencies verified locally; deployed: no; operationally-enabled: no. ADMIN-04 remains partial. Historical audit and previous evidence reports are retained.

## Reproduced defects and fixes

1. Preview A pending, change selection scope away and back, start another A preview, resolve newer then older: NEW became OLD. Monotonic request generation now invalidates results, errors and final busy cleanup, including unmount and the interval before hashing finishes. Returning to an identical selection hash cannot revive a prior request.
2. Malformed JSON returned 503. `InvalidRequestJsonError` now returns 400 before reading contacts; oversized body remains 413.
3. Actual 390px browser reported `scrollable-region-focusable`. A named focusable comparison region allows keyboard horizontal scrolling.

New regressions first failed: 5 pass / 4 fail / 30 assertions / exit 1. Fixed focused suite: 13 pass / 52 assertions / 636ms / exit 0. Independent reviewer: both P2 findings closed, 11 pass / 48 assertions in three files; no remaining important finding.

## Executed verification

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate src/components/admin/crm/contactFormatRecovery.test.tsx src/routes/api/admin/supporters/format-preview.test.ts src/lib/crm/contactFormatPreview.test.ts src/components/admin/crm/SupporterList.test.tsx` | final application, synthetic tests | 13 pass, 52 assertions / 0 |
| `bun test --isolate --timeout 30000` | CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321 | 3136 pass, 145 skip, 0 fail, 9912 assertions, 581 files, 35.87s / 0 |
| `npm.cmd run typecheck` | final application | 0 |
| `npm.cmd run lint` | final application | 0; 52 warnings |
| `npm.cmd run build` | synthetic loopback54329 Supabase URL/key build configuration | 0 |
| `bun scripts/verify-contact-format-local.mjs` | actual route handler, isolated Auth/PostgREST57321, 999 synthetic rows plus one absent selection | 1000 ordered results; treasurer 213.08ms, admin 113.77ms / 0 |
| `node scripts/verify-contact-format-review.mjs --before` | original integrated panel, same browser/host56574, 390/768/1366 | OLD text in 38 cells at each width; mobile Axe violation / 1 |
| `node scripts/verify-contact-format-review.mjs` | final panel, intercepted synthetic API, same three widths | stale cells 0, 25 visible rows / 40 pages, keyboard paging/scrolling, failed read retry, unmount clears PII, Axe0, no page overflow/errors / 0 |

Actual local route verifies missing/invalid tokens 401; ordinary authenticated user, staff, pending and disabled roles 403. Treasurer/admin see only requested rows; same token reflects role/status changes. All four categories contain 250 items; deleted/missing rows expose no contact data. All 999 source rows compare byte-for-byte in serialized database reads before/after; direct anonymous/authenticated contact reads return no fixture PII. All synthetic supporter/admin/Auth rows removed. Generated login link was redeemed locally; no email was sent.

The component fixtures preserve original/after source selection in the Vite loader. Six PNGs: `ui/t23-contact-format-{before,after}-{390,768,1366}.png`. Browser and Axe inspected the rendered DOM; standalone image viewer unavailable. Local read timings are observations, not a before/after performance improvement claim. Hosted staff UAT, private-file/export journeys and provider sandbox journeys: not-run for this slice. Exact-head CI runs brand/a11y/performance/RLS gates after push; pending at report creation.

## Compatibility, rollback and operator handoff

No migration, new grants or RLS changes. Existing supporter fields and verified current admin identity are prerequisites. The 59-file inherited migration inventory is not permission to apply all files. Removing this UI/route is an application rollback with no stored preview state to reverse. PII is held only in component memory, not session storage. Clear/reselect after changing filters; inspect before/after suggestions, and use the existing individually audited edit flow for a reviewed correction. Email identity and consent must never be inferred from a formatting suggestion.

Main/last verified production alias remains `24196faf027998388eff3196a6979e23566e2443`; main CI36624781016 five green; #134–#155 are the 22 merged PRs. #175 CI36652518390 five green on its exact head, with exact migration approval requested. #156's isolated OTP concurrency failure still blocks sequential release; disabled-feature exception has no answer. No new main merge, deployment, production DDL, payment, email, public preview or operational activation was performed. Payments and new schedules remain disabled.


## Root combined review checkpoint 176 — 2026-10-01 HKT

Reviewed candidate 30d16463fb2442a4962817ee5ca6321ec37ca620 integrated predecessor 66663ba8abca94d9afbfdbff35d41f5f65f8fa88. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 60 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 66 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. Earlier isolated DB/build runs remain bound to their recorded source and environment. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.
