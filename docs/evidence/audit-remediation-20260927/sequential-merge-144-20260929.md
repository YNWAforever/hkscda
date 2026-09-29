# PR #144 sequential verification — 2026-09-29

Tested source 6f208b7 incorporates predecessor #143 at 644c439. Resolved editor merge conflicts by retaining imperative unsaved-change controls and history/detail loading props; documentation retains both slices. No new migration is introduced by #144.

## Executed gates

- `bun test --isolate`, explicit local DB 57322 and RLS API 52321: exit 0; 2860 pass, 83 skip, 0 fail, 8761 assertions across 484 files.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0; 53 warnings, zero errors.
- `bun run build` with loopback fixture 54329 and placeholder keys: exit 0; route tree unchanged.
- `node scripts/verify-adoption-unsaved.mjs`, CMS_UNSAVED_TEST_ORIGIN=127.0.0.1:56542: exit 0; predecessor cancel/save/409/discard/Escape behaviors survive the merge.
- `node scripts/verify-adoption-history.mjs`, same 390x844 synthetic Vite fixture: exit 0. Keyboard pagination makes one summary request; opening selected revision makes one detail request. Dirty text survives both, route exit still prompts, and staff restore control stays hidden. All admin API responses intercepted; no real staff identity or production mutation.
- `psql -X -v ON_ERROR_STOP=1` with scripts/test-adoption-history-db.sql in local supabase_db_hkscda-audit-integration-573: exit 0. Synthetic revision counts 1 before, 1002 in transaction, 1 after rollback. Same-run payload: legacy 1402897 bytes, summary page 8711 bytes. Single EXPLAIN ANALYZE execution: 2.537 ms legacy, 0.543 ms summary. This is synthetic local evidence, not production latency.

## Current compatibility blocker

Production read-only catalog on 2026-09-29 still returns null for adoption_instruction_revisions and adoption_instruction_pages, with no adoption_instruction RPCs. The absent prerequisite is historical source migration 20260926152438_adoption_instruction_page_cms.sql; it has NOT been applied. Therefore schema-ready and operationally-enabled remain false for CMS even though this slice has no new migration. #133's narrowly scoped approved seed fallback for the public instructions remains intact. Do not apply a broad migration push or seed/publish content to bypass this blocker. Authenticated staff UAT is not-run.

Remote CI on this updated head and sequential predecessors remain merge gates. #142's distinct migration approval is still pending at this record. Rollback for #144 is application-only; it restores unbounded history/old revision lookup behavior. Preserve the unsaved-change guard and existing audit/version checks.

#140 merged f52500d9eabc0383ec0f6afd9fec2e0607e2dac6 after PR CI 36507749697 passed all five jobs; deployment dpl_C6qnkeh7gSspa4CBYwWtRUGrEQkL READY. #141 awaits prior main CI at this record.
