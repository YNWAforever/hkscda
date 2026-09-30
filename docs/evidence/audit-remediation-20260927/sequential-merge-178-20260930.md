# PR178 sequential release preparation — 2026-09-30

## Source and repaired defects

Application `79838107c738854a28ac5a977b0e9fa6c3c6f5c2`; integrated baseline `5f44bb9d55e488539cb695df111bcb68b52c2a39`, including PR177. Shared live-actor repair is commit `c5cdeed7d500e7e9ba0504f2264680ba1adb2c44` and is being backported to PR175.

The original assignment column inherited authenticated table-wide INSERT/UPDATE. A real local staff JWT could assign an ineligible target without the guarded snapshot RPC. The failing direct-write test exited 1 (1 pass / 1 fail). The revised SQL removes authenticated table-wide INSERT/UPDATE and restores these grants on every pre-existing column; the new assignment column is writable only through the service RPC. Existing RLS, ordinary supporter edits, version triggers and audit history remain. Direct INSERT and UPDATE of the assignment column now return 42501 for staff, treasurer and admin; an ordinary name edit still succeeds.

Four recovery regressions first failed (0 pass / 4 fail): a late mount read could overwrite a newer preview; a temporary read failure discarded its recovery ID; an unmounted POST could replace a later mount's stored operation; another actor could inherit the saved operation. Requests now serialize and fence results by mounted generation, retain actor-scoped recovery IDs and provide a read-only retry. A failed/unknown apply blocks further writes until a confirmed fresh read. Operation and assignee-picker errors are separate.

The cached admin identity could outlive a live Auth account change. Sensitive assignment and bank requests now bind the expected actor before bearer-token selection and again after parsing the response. A live Auth subscription hides the panel immediately and resets verified identity outside the synchronous auth callback. Real QueryClient/QueryObserver held-response tests reproduce A→B→C and the same-actor TOKEN_REFRESHED variant before repair (exit1); separate actor and event generations close both. Older initial getSession reads and unmounted callbacks remain fenced. This is an identity race repair, not a replacement for server role checks.

## Verification actually executed

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate src/lib/admin/useLiveAdminActor.test.tsx` before final generation fix | mocked Auth, actual QueryClient/Observer | 5 pass / 1 fail / 19 assertions / 1 |
| Actor/core/bank recovery focused command | synthetic HTTP/Auth | 13 pass / 44 assertions / 0 |
| Independent bounded actor/recovery review | current source; no providers | no remaining findings; 27 pass / 80 assertions / 0 |
| `CRM_ASSIGNMENT_MIGRATION_ALLOW_LOCAL_FIXTURES=1 bun scripts/verify-crm-assignment-migration.ts` | schema-only clone, loopback52322/audit_pr135_20260929; rollback transaction | exact SQL43.45ms; 15 old rows unchanged; preview1000 70.20ms; apply900 444.14ms; 898 succeeded / 101 skipped / 1 conflict; 898 assignment audits; cleanup0 / 0 |
| `bun test --isolate src/lib/crm/assignmentBulk.database.test.ts src/lib/crm/assignmentBulkBehavior.database.test.ts src/lib/crm/assignmentBulkConcurrency.database.test.ts` | explicit local fixture opt-in; actual service_role, authenticated roles and two connections | 5 pass / 31 assertions / 513ms / 0 |
| `node scripts/verify-crm-assignment-review.mjs --before` | same local Vite fixture and Chromium, 390/768/1366 widths | original mount request did not block new preview; expected failure / 1 |
| Final `node scripts/verify-crm-assignment-review.mjs` | same fixture, current code; 12 cases | mount/retry/lost-response/actor isolation, 1000-item CSV and keyboard; Axe0, overflow0, page errors0 / 0 |
| First after browser run | same environment | harness sampled DOM before awaited render; 1; corrected harness then reran |
| `npm.cmd run typecheck` | integrated candidate | 0 |
| `npm.cmd run lint` | integrated candidate | 0; 52 warnings |
| `bun test --isolate --timeout 30000` | checkout DB57322; Auth/API52321; CRM DB52322; synthetic local settings | 3159 pass / 145 skip / 0 fail / 10026 assertions / 589 files / 61.04s / 0 |
| `npm.cmd run build` | synthetic Supabase loopback54329 build configuration | 0 |

The DB tests recheck current actor/assignee roles, expiry, per-item versions, audit exception rollback and terminal retries. Two concurrent snapshots produce one success, one conflict and one assignment audit. Exact-file rehearsal verifies signatures, SECURITY DEFINER/search_path, browser/service grants, private helper revoke and RLS. No production data was copied to the clone; fixtures are synthetic and cleaned up. Skips are not passes. Browser fixtures exercise actual components with intercepted synthetic APIs; they do not establish hosted staff UAT or real provider/email delivery. Hosted full journeys/private files/provider sandbox are not-run for this slice.

## Screenshots and performance boundary

Three before and three after captures use the same host/browser/fixture at widths390,768,1366. The UI records late-read ordering, keyboard actions and zero horizontal overflow. Local timing above is a single exact-file DB rehearsal, not hosted latency or a median improvement claim. Existing measured public before/after comparisons remain attributed to their original sources.

- [t23-crm-assignment-after-1366.png](ui/t23-crm-assignment-after-1366.png) — SHA256 `d89bbd800e70168a633b8c5b9b470db2b3eaa313259e9aff7345d1648f227b24`
- [t23-crm-assignment-after-390.png](ui/t23-crm-assignment-after-390.png) — SHA256 `102d440109a0d434ed4f1e71e45d402d1a56ca0eae9b89bb22e561cb2116950b`
- [t23-crm-assignment-after-768.png](ui/t23-crm-assignment-after-768.png) — SHA256 `0c5c12ea8dda8fbd231430e6c6ed8c0b52c625e4cc26c3343029a795eeb0b355`
- [t23-crm-assignment-before-1366.png](ui/t23-crm-assignment-before-1366.png) — SHA256 `82d3ca211fc6bdb9eed90bfd08f24285d99e1da76c317f629eb5b50905f408c5`
- [t23-crm-assignment-before-390.png](ui/t23-crm-assignment-before-390.png) — SHA256 `2bf1410a980acf05e9777a4f4a994a0b5704c23862598895cc7b0e7566daa4bc`
- [t23-crm-assignment-before-768.png](ui/t23-crm-assignment-before-768.png) — SHA256 `c589b2a682beae641731e1bd66b568b638276fddbafc16aea4a6eaca8d4d345c`

## Migration, compatibility and rollback

Exact candidate: `20260928120000_crm_assignment_bulk.sql`, canonical LF SHA256 `f848a5a3b955178b54c864cabd8611ada12ac63b9cbafba7b2eef8c9731f4297`. It adds the nullable CRM follow-up owner, snapshots/items, eligible-assignee picker and permission/version guarded RPCs. Existing 15 production supporters would retain all prior fields and get a null owner. No assignment backfill, identity merge, refund, adoption approval or notification occurs. The grants adjustment preserves INSERT/UPDATE of all prior columns and intentionally prohibits direct writes to the new column. The 61-file manifest is an inventory, not apply-all authority.

Fresh read-only production inspection: ledger95, supporters15, new owner column absent. Fresh remote main and alias both `24196faf027998388eff3196a6979e23566e2443`; Vercel `dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk` READY, main CI36624781016 previously five green. No production mutation during preparation. Exact migration approval has not yet been requested; it follows current-head five green gates, backup/catalog preflight and all predecessor releases.

Restricted CurrentUser DPAPI backup retained: `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior decryption roundtrip checked; full restore not-run, Storage bytes absent, provider backup availability previously null/PITR false. Reverify before DDL.

Rollback the application to the preceding release while retaining owner/version columns, restrictive grants, snapshot records and audit facts. Do not delete committed assignments or reset versions; privileged correction requires a separately audited operation. No reverse table grant or migration-ledger fabrication. Staff should review the selected contact count and assignee, preview, apply, inspect per-item results and download the CSV. On an unknown apply or read error, retain the operation ID and use read-only refresh before considering a retry. Account changes invalidate the old panel and keep separate recovery storage.

Code-complete for this slice; schema-ready: isolated only; deployed: no; operationally-enabled: no. 22/46 PRs (#134–#155) merged. #156 actual OTP concurrency failure still blocks the ordered release despite its five ordinary CI gates being green. Its disabled-feature exception remains unanswered. #157/#161 migration approvals are retained; other pending exact approvals are separate. Payments and new schedules remain disabled. Current-head CI is pending push.
