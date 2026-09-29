# T11 / R04 — adoption CMS revision history

Draft PR [#144](https://github.com/YNWAforever/hkscda/pull/144), implementation commit 558f191c4ff8b801bf4a758aef37d38118b3b528. Status: code complete and isolated verified; schema not applicable; deployed no; operationally enabled no.

## Reproduction and change

The baseline admin page selected every revision with its full content, then looked up published and draft IDs inside that response. A default 1000-row PostgREST cap can omit an older active published revision. Before the fix, the 1/100/1002-row synthetic tests had 3 failures: unbounded content at 1 and 100 rows, and a 500 when an active version fell outside the 1000 returned rows.

The admin page now reads published and draft directly by page-state ID. The initial history contains at most 25 summaries without content. A revision-number-plus-ID cursor pages further summaries (max 100); the full revision is fetched only when selected. Restore reads the requested revision directly, validates page key and content, then passes the latest page version to the existing atomic RPC. Existing audit, role, idempotency and publication operations remain under their prior contracts. History/detail routes return no-store and reject unauthorized identities.

## Verification on 2026-09-27

Environment: isolated worktree codex/audit-cms-history-20260927 and the exact unlinked local container supabase_db_hkscda-audit-remediation-20260927. No production database access.

| Command or gate | Exit | Result |
| --- | ---: | --- |
| bun test src/lib/adoptionInstructions/repository.server.test.ts before fix | 1 | 3 fail, including active published revision omitted at 1002 rows. |
| bun test src/lib/adoptionInstructions src/components/admin/content/AdoptionInstructionsManagement.test.tsx | 0 | 34 pass, 0 fail; includes cursor stability under new writes, direct old-revision restore, staff/admin identity and no-store. |
| SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8 | 0 | 2795 pass, 83 skip, 0 fail across 469 files. |
| bun run typecheck | 0 | Strict TypeScript passed after route generation. |
| bun run lint | 0 | 52 pre-existing warnings, 0 errors. |
| bun run build | 0 | Client, SSR and Nitro build passed; generated route tree committed. |
| Prettier check and git diff --check | 0 | No format or whitespace issues. |
| Exact-container rollback-only SQL from scripts/test-adoption-history-db.sql | 0 | Revision count 1 before, 1002 during, 1 after rollback. |

Synthetic payload in the same Bun fixture: at 1 revision, legacy history 1339 bytes and new admin response 1915 bytes; at 100, 132101 vs 10425 bytes; at 1002, the legacy 1000-row history response 1322796 vs 10482 bytes. The new response includes active revisions and summaries; the legacy value is the history query only.

In the same local PostgreSQL transaction with 1002 rows, legacy 1000-row history projection was 1402897 bytes versus 8711 bytes for a 26-row summary query. A single EXPLAIN ANALYZE execution reported 1.812 ms and 0.920 ms respectively. These measurements are synthetic and do not establish production latency.

## Compatibility, rollback and staff handoff

No schema migration is needed. The existing GET admin page retains page, published, draft and history keys; history entries now omit content, and historyNextCursor supplies pagination. The UI uses the new history and revision detail endpoints. Staff can load more summaries and inspect full content before an admin restores any valid old version. Restore remains version-guarded and audited in the existing database transaction.

Rollback: revert 558f191c4ff8b801bf4a758aef37d38118b3b528 before merge or in a later release; no data rollback is required. Remaining gates: draft PR review, authenticated staff UAT in an approved isolated environment, and release approval. Vercel audit-branch preview suppression was included before push; a Vercel deployment listing after push returned zero audit deployments.
