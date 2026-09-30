# PR #159 / T23 CRM tag bulk — sequential verification, 2026-09-30 HKT

## Scope and status

Integrated baseline `3f9b1e32510ccebb622c826c8e5c69e847790b4b`; repair commit `baf92b184fc3488c69eb5eb853496c340cd87cfb`. Documentation-only integration `2ed4f937` carries the completed #153 release evidence. This slice permits only additive supporter tags through a stored snapshot, explicit preview, per-item authorization/version checks and durable results. No identity merge, refund, adoption approval, notification or production CRM write was performed.

ADMIN-04 remains partial across domains. This slice is code-complete, rehearsed locally, not schema-ready in production, not deployed and not operationally enabled. #153 is merged as 4304127a and production READY; main CI 36620897215 all five green. #154/#155 approvals remain sequential; #157 exact migration approval is recorded. #156 retains its unresolved local Auth concurrent OTP failure.

## Reproduced defects and repairs

1. Actor eligibility was checked without holding the Auth/admin rows. A second connection could commit suspension while an authorized bulk transaction was still open: red **2 pass / 1 fail / exit 1**. The private actor helper now takes shared locks on both authoritative rows until commit. Revocation waits, and the next transaction sees the revoked role. Actual service-role tests establish this ordering.
2. A temporary GET failure removed the saved operation ID, losing refresh recovery. Browser baseline reproduced it at all three widths. Keep the ID, show a safe failure and offer **重新讀取結果**. A later read resumes the server-owned result.
3. The 1000-item preview's scrolling table was not keyboard-focusable. Axe reported `scrollable-region-focusable` at all widths. Added a labelled focusable region; final Axe has zero violations.
4. Malformed JSON returned 503: red **3 pass / 1 fail / exit 1**. Map the bounded reader's explicit InvalidRequestJsonError to 400 without mutation, preserving 413 and no-store. Repaired API file: **4 pass / 17 assertions / exit 0**.

## Executed verification

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | Checkout DB 57322, isolated API 52321 | 2987 pass, 105 skip, 0 fail; 9273 assertions, 530 files, 29.86s / **0** |
| `npm.cmd run typecheck` | Current worktree | **0** |
| `npm.cmd run lint` | Full configured lint | **0**, 52 existing warnings |
| `npm.cmd run build` | Synthetic configuration, loopback 54329 | **0** |
| `bun test src/lib/crm/tagBulk.database.test.ts` | Exact schema-only clone `audit_pr135_20260929` at 52322, explicit fixture flag | 4 pass, 0 fail, 35 assertions, 850ms / **0** |
| `node scripts/verify-crm-tag-bulk-review.mjs` | Actual UI components, loopback 56558, synthetic API/state | **0** at 390/768/1366px; recovery, partial retry, CSV, 1000-item pagination, new-preview confirmation reset, keyboard and Axe |
| `bun test src/lib/operations/migrationManifest.test.ts` | Canonical LF SQL manifest | 1 pass / **0** |

Initial full-suite attempt: 2986 pass, 105 skip, 1 fail, exit 1 because the manifest contained the Windows CRLF byte hash instead of canonical LF. Corrected the manifest to the exact normalized source hash below; full repeat passed. Initial lint failed on 469 line-ending/format errors in the newly edited test; formatting corrected them. A test assertion initially compared bigint string "1" with numeric 1 and was corrected without weakening its value assertion. One browser invocation ran after its fixture server had been stopped and returned connection refused; the final self-contained server/runner invocation succeeded and closed the server. These are recorded harness failures, not hidden passes.

Browser before/after: `ui/t23-crm-bulk-{before,after}-{390,768,1366}.png`. Simulated response loss occurs after ten of 25 items succeed; read recovery shows 10 succeeded/15 pending, retry reaches exactly 25 writes, and result CSV downloads. A fresh 1000-item preview renders 25 rows on each of 40 pages and resets confirmation. No horizontal overflow, including 200% zoom at 768px, no page errors and zero Axe violations. The browser API is intercepted; actual DB safety is established separately below. Hosted real-staff UI/private export/provider tests and local public-brand/performance runs for this slice are not-run. Skipped full-suite cases are not passes.

## Exact migration, rehearsal and compatibility

File: `supabase/migrations/20260927172030_crm_tag_bulk.sql`.
Canonical LF SHA-256: `d4a1a51db9b25feae7e440609ce5cfbb410e9e25e2f870f96df26618151489a6`.
This replaces the undeployed candidate hash only; no applied migration or provider ledger was rewritten.

Adds two private RLS tables, two secondary indexes and three public service-role-only RPCs, plus a pinned private actor helper. No existing supporter rows are backfilled or changed by the migration. Service role has table SELECT only; all writes go through audited definer RPCs. Anon/authenticated have neither table reads nor function execution. Definers pin empty search_path. Existing application code is compatible with the additive objects; new bulk code requires them and supporter.edit_version from #149.

Exact candidate SQL ran in BEGIN/ROLLBACK against the schema-only clone: **894ms including Docker/psql startup, exit 0**. Applied only to that clone, without adding a fake ledger entry. The SQL text used by this drill normalizes to the canonical hash above. Current production read-only preflight (ledger 90) confirms both new tables and the apply RPC remain absent.

The DB fixture owner creates synthetic users/rows, then actual commands run as service_role. Coverage includes 1001 cap, snapshot expiry, stale/deleted item results, duplicate submission, forbidden anon/authenticated calls, staff role, disabled/banned/unconfirmed actor and same-transaction audit rollback. Injected audit failure leaves the original tags, edit version 1 and pending item unchanged. Two concurrent apply calls produce one committed tag mutation and one audit. Shared actor locks prevent admin disable or Auth ban from committing mid-operation; subsequent disabled calls reject with 42501.

The 1000-row fixture yields 100 already-tagged items, 898 successes, one version conflict and one deleted skip; a repeat does not add another audit. All fixtures roll back or are removed by exact generated IDs. Postflight: zero operations, items or supporters in the schema-only clone; both tables RLS true, anon/authenticated read false, service SELECT true and direct INSERT/UPDATE false; all four function signatures/grants/search paths correct. CI now includes a mandatory dedicated bulk DB scenario step at disposable 55322.

## Release approval and rollback

Production migration is **not approved or applied**. Request approval only for this exact reviewed file after current-head remote gates and sequential prerequisites. Recheck catalog, dependency signatures, grants/RLS and the authorized restricted CurrentUser-DPAPI backup before applying. Do not db push, alter historical migration ledger entries or backfill bulk operations.

For rollback, disable access to this new bulk UI and revert application code while retaining operations, results, supporter tags and audit history. Do not drop the tables or automatically undo successful tags after other edits. Each HTTP apply processes at most 25 pending items; partial failures are recovered by reading the stored operation and reviewing its results, not replaying already successful mutations.

Staff handoff: freeze selection, enter one tag, inspect per-item before/after values, confirm, apply the next bounded batch, and inspect/download results. Use **重新讀取結果** after interrupted responses. Re-preview after expiry or conflicts; do not bypass version checks or change the reviewed scope during apply. Payment/recovery delivery/new media schedule remain disabled.

## Independent-review follow-up — pending mount recovery

The #160 reviewer identified a shared UI race: GET(A) during mount could finish after a newer preview(B), overwriting the displayed operation while the saved recovery ID pointed at B. The equivalent CRM browser regression reproduced this at 390/768/1366px (recoveryBlocksPreview=false; exit 1). Mount recovery now sets busy before reading and releases it only while mounted; preview/reload remain disabled until completion. All three sizes then passed (recoveryBlocksPreview=true; exit 0), including prior 25-write recovery/1000-item/CSV/Axe cases. SQL and its approved-candidate hash are unchanged. Prior current-head CI 36622408652 had five green; this code follow-up requires a new current-head run.

Follow-up verification detail: first post-fix browser run timed out because the preview label changes to 處理中… while busy. Corrected only that locator; final runner exit 0 at all three widths. Typecheck/lint/build repeated after the UI fix, all exit 0. Full integrated #160 repeat including this CRM fix: 2993 pass / 109 skip / 0 fail, 9309 assertions, 27.84s / exit 0; #159 exact-head full suite will run in CI.

Exact-head remote follow-up: 94253641c5148749a05cdb25127437eb2af7f7ec, CI 36626877044, verify/rls-matrix/brand-verify/a11y-verify/performance-verify all SUCCESS. Production migration approval still pending; sequential release waits for #156.
