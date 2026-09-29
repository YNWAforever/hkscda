# PR #154 sequential verification — 2026-09-30 (Hong Kong)

Integrated source baseline `f1b28fb` includes repaired #153 code `c457a5d686e29d87b498489669a42fb9d8327adc`. Production remains #152 (`2b718dc8adcc123707885d1827071448ae4cdc6e`). #153 current head `b8f0c007483d7fc3bf3e00b1cbb98489d899ee09` passed all five CI jobs in run 36607162283, including its required content eligibility DB step; production migration approval is pending. Do not merge #154 before #153 and its main release gates.

## Fixed and verified

1. Undeployed media repair migration shared 20260927140000 with the deployed donation delivery migration. Regression: 47 pass / 1 fail; rename only the undeployed media file to `20260927140500_media_repair_retry_schedule.sql`. Canonical SQL unchanged. Green: 48 pass / 698 assertions / exit 0. Existing provider ledger identities and historical reports unchanged.
2. Pending retry allowed the user to select/edit a different item; the old request settlement could clear the new form. Browser red exit 1 (`Cannot change reviewed item while retry is pending`). Pending review buttons, reason and checkbox are now disabled. Selecting another item resets the previous mutation error. Same browser regression green at 390/768/1366px, one request for the original item, failure preserved, new selection blank/unconfirmed with no inherited error, 200% CSS zoom at 768px, no horizontal overflow/page errors. Before/after screenshots use exact old component f1b28fb and the same loopback fixture: `ui/t19-media-repair-{before,after}-{390,768,1366}.png`.
3. Both database tests now execute RPCs as actual service_role after owner-only fixture setup. Accepted DBs are exact loopback 57322/postgres, 52322/audit_pr135_20260929, or CI-only 55322/postgres; protocol/query/hash checked and fixture opt-in required. Added mandatory CI media DB scenario step.

## Actual verification

| Command and environment | Result |
| --- | --- |
| Five focused worker/policy/admin/cron files | 14 pass / 74 assertions / exit 0 |
| `bun test --isolate --timeout 30000`; DB 57322, API 52321 | Final 2942 pass / 94 skip / 0 fail; 9068 assertions; 505 files; 27.63s; exit 0 |
| `bun run typecheck` | exit 0 |
| `bun run lint` | exit 0; 52 warnings |
| `bun run build`; synthetic keys / loopback 54329 | exit 0; route tree unchanged exit 0 |
| `node scripts/verify-media-repair-review.mjs --baseline` | exit 0; records both old UI defects at three widths |
| `node scripts/verify-media-repair-review.mjs` | exit 0 at three widths after the fix |
| Exact clone media DB tests; explicit fixture flag and URL 52322/audit_pr135_20260929 | 2 pass / 450 assertions / 0 fail / exit 0; 300ms |

Initial full-suite run was 2940 pass / 94 skip / 2 fail because two tracked-copy scans still saw the old un-staged migration filename (ENOENT). Staging the rename corrected the Git index; the full repeat above passed without changing either test. Skips and real staff/provider UAT remain not-run. Screenshots are synthetic component evidence, not full authenticated UAT or a performance benchmark.

## Production catalog and required ordered manifest

Read-only production checks found `animal_publication_media_copy` and `animal_publication_publish_receipt` absent, plus both claim and legacy acknowledgement RPCs absent. This is a real R01 dependency; the retry migration alone cannot apply. `content_public_asset` exists, RLS enabled, 0 rows / 0 unready, 32768 bytes; empty-row hash `d751713988987e9331980363e24189ce`. `animal_publication_version`, `animal_publication_command(uuid,jsonb)`, content publication prepare/request/session tables and the readiness trigger exist. Ledger remains 88.

| Apply order / source file | Canonical LF SHA-256 |
| --- | --- |
| 1. `20260926170000_animal_publication_media_copy.sql` | `94e5f795a543860bb47e710561c2c679f811dcacc39ac6ab30d17c4d9ef08317` |
| 2. `20260926180000_animal_publication_publish_receipt.sql` | `e84dd5298fed3eca3b961b8dc0c0d08892f9d16bdf94cb700db63d7c7e9b5fdd` |
| 3. `20260926190000_content_publication_media_after_commit.sql` | `d0fcb0c6ebbcfbfaf2bd245964815d6052c30880919d5344b806f9c1f072c53f` |
| 4. `20260927140500_media_repair_retry_schedule.sql` | `dfe96f1a4f8d73a0e8f606e14fb2854d8c91c2b6818cc2917c279a0d85e1e429` |

The first three files already belong to the reviewed #130 safeguards. They create durable same-transaction media intent and publication receipts, preserve lost-response idempotency, and require publication commit before public media copy. They do not publish historical media or backfill copy intents. Last file adds retry metadata/backfill/indexes and fenced RPCs. Its animal claim return shape gains token/attempt count; old workers tolerate extra fields and retain legacy acknowledgement signatures. New workers require the complete schema.

## Isolated rehearsal and role checks

Before these files, both tests failed on the production-schema-only local clone with 42P01/42703 (0 pass / 2 fail / exit 1). All four files then ran inside one BEGIN/ROLLBACK with lock_timeout 5s and statement_timeout 30s. Inserted 500 synthetic pre-retry intents: backfill kept 498 pending at created+5min, 1 claimed at claimed+1h and 1 completed with no retry date. Exit 0; 458ms including Docker/psql startup, not a production lock estimate. Applied each exact file only to the local clone, exit 0, then the two service-role tests passed.

Tests cover 500-item fairness after oldest 50 fail, all remaining 450 advancing, stale/double acknowledgement, attempt 8 terminal failure/crashed lease, bounded staff queue without private source paths, audited manual retry, forbidden-role grants and draft content excluded from repair. Fixture rollback left 0 animal intents / 0 content assets. Catalog: all three affected/new tables RLS enabled, four retry constraints valid, both due indexes present, six new repair/staff RPCs have pinned search_path, service_role EXECUTE and no anon/authenticated EXECUTE.

## Apply and rollback runbook

Production: **not applied**. Requires exact four-file production approval after #153. Recheck catalog and approved restricted DPAPI backup checksum, apply these reviewed files sequentially with postflight counts/signatures/grants/RLS after each, and record actual provider-generated migration identities. Do not blind db push, forge ledger entries or rename already-deployed files. Preserve all prior data and existing webhook/reconciliation intake.

Backup: `hkscda-before-pr135-20260929T003437Z.dpapi`, CurrentUser DPAPI, checksum C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2, rechecked during #153 review. Full backup restore not-run; storage-object bytes excluded. Database rollback retains additive schema, receipt/audit history and copy intents; revert application or pause only the new repair schedule. Do not restore an old DB snapshot over new events or drop retry fields. Old acknowledgement RPCs are retained for app rollback.

## Scheduler and staff handoff

New five-minute schedule requires CRON_SECRET and is unauthorized before any service client is created when absent (tested). Existing environment-name check found CRON_SECRET absent; no key or scheduler enablement was changed. Team Pro subscription was verified during preceding release work. Generated Nitro function metadata specifies nodejs24.x with no explicit maxDuration; effective hosted duration is still unverified (Vercel get_project connector returned argument-schema error). Enable the new repair schedule only after effective duration, schema and Storage-copy acceptance are confirmed. Existing daily cleanup remains configured. No private image was copied to a public bucket in these tests.

Staff: read safe queue/error code; correct the underlying storage/config/content issue first; select one failed item; enter 10–500 character reason; confirm the cause was corrected; submit once. While pending, selection/inputs are locked. On stale/failure response reload and review current state. Do not bulk-reset failures or assume a reason proves repair. Actual Storage copy, real staff identity UAT, queue performance measurements and operational enablement remain not-run.

## Approved scope checkpoint

User explicitly approved the four listed production migrations after #153 completes, with no historical photo backfill, new cron activation, email or payment. Removed the new `/api/jobs/public-media-repair` entry from `vercel.json` before release, so merging this PR will not install the new schedule. The protected handler remains available for later separately approved activation. Existing donation/volunteer/sponsorship/public-uploads/CRM schedules are retained. SQL checksums are unchanged. #153 exact production migration approval is still pending.
