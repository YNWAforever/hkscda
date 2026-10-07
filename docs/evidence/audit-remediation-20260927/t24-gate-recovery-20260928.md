# T24 exact-source isolated gate recovery, 2026-09-28 HKT

Source is local-only integrated app commit 72d0fda625791d974cd1fcd3d565360766b93bd8. The two Supabase stacks are unlinked and synthetic: 57322 Postgres from hkscda-audit-integration-573 and 52321 API/52322 Postgres from hkscda-audit-integration-fresh. Both had previously applied all 170 committed migrations with real ledgers. No production data, provider callback, mail, payment, reset, or forged ledger row was involved.

## Recovered checks

| Command / fixture | Exit | Result |
|---|---:|---|
| bun test --isolate --parallel=1 --timeout=60000, with selected BANK_DRY_RUN, BANK_MATCH_CONFIRM, CRM_ASSIGNMENT_BULK, CRM_TAG_BULK, DELIVERY_RETRY, MANUAL_FINANCE, SPONSORSHIP_FOLLOWUP_BULK, SPONSORSHIP_FOLLOWUP DB flags pointing to 127.0.0.1:57322, CHECKOUT_POLICY_TEST_DATABASE_URL also 57322, SUPABASE_LOCAL_URL=http://127.0.0.1:52321 | 0 | 3076 pass, 114 skip, 0 fail, 9789 assertions; 3190 tests across 574 files; 138.75 s. Skipped cases are not passes. |
| Focused CRM assignment concurrency and bank-match confirmation database files on 57322 | 0 | 3 pass, 25 assertions; one-winner/one-conflict and one settled bank match despite two racing snapshots. |
| bun scripts/check-release-schema.ts with CHECK_RELEASE_SCHEMA_DATABASE_URL=127.0.0.1:52322 | 0 | 145 compatible requirements, zero issues; latest migration 20260928120000. |
| bun test --isolate --parallel=1 --timeout=60000 supabase/rls-tests with SUPABASE_LOCAL_URL=127.0.0.1:52321 after synthetic REST restart | 0 | 48 pass, 4 skip, 0 fail, 86 assertions. Money/PII, document-slot and sponsorship role cases ran. The four skips were the public-animal visibility file, including its two substantive assertions, because its five-second startup probe timed out. |
| bun test --isolate --parallel=1 --timeout=60000 supabase/rls-tests/animalsPublicVisibility.rls.test.ts on the same warmed API | 0 | 2 pass, 0 fail, 9 assertions: anonymous fostered/published visibility and draft/adopted exclusion. |

The RLS results cover the substantive assertions across two runs; there is no claim of a single all-pass matrix run. Remote focused PR #179 CI passed its own RLS gate; no remote CI ran on this combined SHA.

## Failure and recovery record

An earlier over-broad all-fixture run and a selected-fixture retry at 72d0fda timed out when the dedicated 57322 host connection stopped answering even a read-only five-second query. A later host query answered in 258 ms; no DB container restart or schema reset was needed. The three previously timed-out race assertions then passed alone. One subsequent full attempt omitted SUPABASE_LOCAL_URL and mistakenly used the repository's default 55321 stack, yielding five RLS failures against the wrong local schema; that attempt was stopped. The passing command explicitly names 52321 API and 57322 DB.

A separate RLS attempt on 52321 initially skipped all 56 because PostgREST did not respond within its startup probe. Only the disposable hkscda-audit-integration-fresh PostgREST container was restarted; its Postgres, data and migration ledger were left intact. The API then returned 200, the 48-case matrix ran, and the remaining animal visibility assertions passed in their own invocation. The isolated environment was intermittently slow, so skip counts and initial failures remain part of the evidence.

## Release boundary

This establishes local source/database/RLS behavior on synthetic fixtures only. The live 79-row migration ledger still diverges from the source, the full production catalog and sanitized data-bearing upgrade remain unverified, and hosted actual-role/private-file UAT, provider sandbox, email sink, production-equivalent performance and release approval remain not-run. Decision stays NO-GO.
