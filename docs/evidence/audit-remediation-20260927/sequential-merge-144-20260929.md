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

## Additional prerequisite rehearsal (2026-09-29)

The historical CMS migration 20260926152438_adoption_instruction_page_cms.sql was rehearsed only in audit_pr135_20260929 on the local fresh container. First attempts failed because the disposable database was owned by supabase_admin and postgres lacked CREATE on database/public schema. Live read-only metadata confirms production database owner postgres and CREATE allowed on public/private. Granted only the missing CREATE privileges to postgres in this local database; re-ran the whole migration in a single transaction: exit 0. Production grants were not changed.

Post-rehearsal catalog: all three CMS tables have RLS; five command RPCs deny anon/authenticated and grant service_role. The migration creates one published seed revision. Therefore it requires separate production migration AND seed-publication review; it cannot be silently included in the #142 approval. Full actor/concurrency rehearsal and approval for this prerequisite remain not-run/pending. No production CMS tables or content were created.

## Latest sequential merge checkpoint

#134–#141 are merged (8 of 46). Latest main is 890e84fae048364cbad9a50a3d7785fc7b97c861 (#141), merged only after #140 main CI 36509476864 passed and #141 PR CI 36508177102 passed all five jobs with no failed steps. #141 post-merge main run 36510299370 is still in progress. Production deployment dpl_EpNUoonUf4osGJg8HSkmBagTZGxe is verified READY at that same SHA. Post-merge CI remains pending separately.

#142 current source aaf9bce4aad559bd816b8bdbfa268c9d1b7bf58b has all five PR CI jobs green (36509080049), has been retargeted to main after verifying predecessor tree identity, and remains unmerged pending separate approval for only 20260927150000_sponsorship_terms_document_kind.sql. #143 source 644c439 has five green PR jobs (36509383199). #144 is locally verified and remote CI is pending. Later #145–#179 have not been merged in this sequence.
