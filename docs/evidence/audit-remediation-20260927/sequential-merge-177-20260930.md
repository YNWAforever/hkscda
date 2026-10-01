# PR177 sequential release preparation — 2026-09-30

## Source and compatibility finding

Application `c75ea7510cdd86c9b0489de7dd3ced78d7e2dac9`, integrated baseline `ee38d76f810dbdd808c3eaeec31e21b11f24a206`; predecessor #176 `30d16463fb2442a4962817ee5ca6321ec37ca620`.

Fresh read-only production catalog: 15 supporters, ledger95, existing `supporter.edit_version bigint NOT NULL DEFAULT 1`, enabled `bump_supporter_edit_version` BEFORE UPDATE trigger and matching private trigger function. All 15 versions are 1; no invalid versions. #149 already supplied this implementation, applied as actual ledger `20260929162248_crm_supporter_edit_version`. Direct EXECUTE currently remains true for anon/authenticated/service_role. No production row changed during inspection.

Original #177 SQL redundantly added the existing column/function/trigger. Exact SQL on the current schema clone failed with PostgreSQL 42701 (`edit_version` already exists), exit1. The candidate now only revokes direct EXECUTE on `private.bump_supporter_edit_version()` from PUBLIC, anon, authenticated and service_role. It preserves #149's column/check/default, role version trigger, function and trigger identities, and stored versions. No repeated backfill or schema recreation. Historical #177 report describes its earlier baseline; this report supersedes that release assessment.

## Verification actually executed

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `CRM_VERSION_FENCE_ALLOW_LOCAL_FIXTURES=1 bun scripts/verify-crm-version-fence-migration.ts` before repair | isolated schema clone52322/audit_pr135_20260929; rollback transaction | duplicate column42701 /1 |
| Same exact-file rehearsal after repair | same clone, 15 synthetic rows | SQL1.31ms; all rows/function OIDs+definitions/trigger definitions unchanged; grants removed; service_role direct profile edit produces version2 and role insert version3; rollback cleanup0 /0 |
| Exact revised SQL applied to clone | only52322/audit_pr135_20260929 |0; no ledger writes |
| `bun test --isolate src/lib/crm/tagBulk.database.test.ts src/lib/operations/releaseManifest.test.ts` | clone URL + explicit CRM_TAG_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 |5pass/101assertions/942ms /0 |
| First `bun test --isolate --timeout 30000` | synthetic local settings |3139pass/141skip/1fail: stale reviewed SQL checksum /1 |
| Final same full command after checksum synchronization | CHECKOUT_POLICY_TEST_DATABASE_URL=57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321; CRM tag DB=52322/audit_pr135_20260929 |3140pass/141skip/0fail/9948assertions/581files/25.84s /0 |
| `npm.cmd run typecheck` | integrated candidate |0 |
| `npm.cmd run lint` | integrated candidate |0;52warnings |
| `npm.cmd run build` | synthetic loopback54329 Supabase build settings |0 |
| Independent source review + releaseManifest test | revised SQL and regression merge |finding closed;1pass/66assertions;diff check0 |

Existing tag tests now execute candidate RPCs as service_role, covering name-only edit conflicts, idempotent apply, role withdrawal, expiry, audit exception rollback, two-connection authorization lock, and 1000 items (898 succeeded, 101 skipped, 1 conflict). Fixture cleanup/rollback leaves no synthetic supporter. No new UI in #177: inherited #176 screenshots and browser evidence remain under their source SHA; no new UI/performance claim. Exact-head CI pending push; hosted provider/private-file/financial UAT not-run. Skips are not passes.

## Exact migration / rollback

`20260928113000_crm_supporter_version_fence.sql`, canonical LF SHA256 `cd7ee888e94bf365533d006567a8c1b25dc0a092ee874918053669a7bebfbf62`. This is an unapplied draft migration edited to work with its now-current predecessor. It requires #149's existing trigger function. The 60-file manifest is an inventory, not apply-all authority.

Production action requires exact-file approval, current backup/hash/catalog preflight and predecessor order. Recheck effective grants and function/trigger identities afterwards without creating real contacts. No table backfill, supporter content edit, version reset, function replacement, payment or email. Trigger invocation remains valid without callers' direct EXECUTE grants, verified as service_role. Application rollback keeps versions, both triggers, restricted grants and audit history; no reason to restore unnecessary direct EXECUTE. Existing seven-argument RPC compatibility remains.

Restricted CurrentUser DPAPI backup retained: `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior decryption roundtrip checked; full restore not-run, Storage bytes absent; provider backup availability previously null/PITR false. Reverify before approved DDL.

Code-complete for this slice; schema-ready: version fence already production-ready from149, grant hardening isolated-ready only; deployed: revised177 no; operationally-enabled: no new workflow. Main/last verified alias24196faf027998388eff3196a6979e23566e2443, mainCI36624781016fivegreen, 22/46 merged134–155. #156 OTP concurrency failure still blocks ordered release. User explicitly approved #161 single migration during this preparation; approval is recorded and waits predecessors. #157 approval also retained. Other exact migration requests remain pending, including175;177 request waits green CI. Payments and new schedules remain disabled; no production mutation this preparation.


## Root combined review checkpoint 177 — 2026-10-01 HKT

Reviewed candidate bf1c67791f4120ee22cd952e20c8571b780021e3 integrated predecessor 1e21f9b3d4d2cf928f9e2b75b54a8e68088f6798. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 61 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 67 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. Earlier isolated DB/build runs remain bound to their recorded source and environment. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.
