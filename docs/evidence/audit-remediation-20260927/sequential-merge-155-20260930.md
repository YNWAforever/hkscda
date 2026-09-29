# PR #155 sequential verification — 2026-09-30 (Hong Kong)

Integrated checkout `fecb822aeff69c17545363ffb22d9fb60b95c261` contains repaired predecessor #154 `ef73e8252cf8bf8a8561f0134f99de5e73d5c811`. This public pagination slice remains undeployed until #153/#154 schema approvals and sequential releases complete. No production row, image, payment or notification was changed.

## Exact migration / current catalog

`20260927143710_public_animal_listing_page.sql`, canonical LF SHA-256 `e2320e10dc29949dacb218ddd46ff28ad6afb3e3bdc865a1416e5306487a518d` (unchanged SQL). Adds immutable strict age normalizer, stored generated age band, two partial listing indexes and bounded SQL page/count/summary RPC. Public results retain RLS and omit private notes/draft paths. Missing RPC is an explicit error.

Production read-only: 292 animals, 248 currently visible candidates, total relation size 245760 bytes; row hash `5f1ebbe1b911ab3f0573999ec978c3f6`; animals RLS true. RPC and generated column absent. Authenticated age UPDATE false, service_role true. These live grants override the stale repository note describing legacy direct browser edits; no grants were broadened.

## Isolated migration and role evidence

Local production-schema clone `127.0.0.1:52322/audit_pr135_20260929` (schema only plus preceding reviewed local migrations): original listing DB test failed with missing RPC 42883, 0 pass / 1 fail / exit 1. Inserted 10000 synthetic pre-migration animals inside BEGIN, applied full migration with lock_timeout 5s / statement_timeout 30s, verified 5000 adult / 5000 unknown generated bands, then rolled back. Exit 0; 490ms including Docker/psql startup, not an estimate of production lock duration. Applied exact migration only to local clone, exit 0.

`PUBLIC_LISTING_TEST_ALLOW_LOCAL_FIXTURES=1 PUBLIC_LISTING_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 bun test src/lib/animals/publicListing.database.test.ts`: 2 pass / 22 assertions / 0 fail / exit 0, 804ms. Covers 1k/10k page/filter/count/order equivalence, anon execution, private notes denial, birthday precedence and sponsorship species. Additional role fixture verifies direct authenticated age update is denied and actual service_role update recalculates senior correctly, all rolled back. An initial probe incorrectly expected authenticated write access and was rejected by existing table grants; that assumption was corrected without any production/application permission change. A lazy SQL rejection matcher initially timed out; explicitly awaiting the SQL in the test fixed the harness.

Added mandatory current-head CI DB step. Guards allow exact dedicated loopback 57322/postgres, clone 52322/audit_pr135_20260929, or CI-only 55322/postgres, reject other protocol/query/hash routing and require explicit synthetic fixture opt-in. Benchmark accepts only the two exact local databases.

## Same-environment performance

`PUBLIC_LISTING_BENCH_ALLOW_LOCAL_FIXTURES=1 PUBLIC_LISTING_BENCH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 bun scripts/bench-public-listing.ts`, exit 0. Thirty warm comparisons on the same 10000 synthetic rows, loopback DB and client. Every old/new result ID and total matched; fixture rolled back.

| Path | p50 ms | p95 ms | Uncompressed JSON bytes | DB calls |
| --- | ---: | ---: | ---: | ---: |
| Old full-row batch read plus JS filter | 221.73 | 306.33 | 4787800 | 11 |
| Candidate page/count/card summaries | 17.56 | 29.49 | 15285 | 1 |

These are local DB/client measurements, not Hong Kong browser latency, deployed cold starts or paid thumbnail delivery. VITE_PUBLIC_IMAGE_TRANSFORMS remains opt-in/default false and was not enabled.

## Code and UI checks

- Full `bun test --isolate --timeout 30000` with DB 57322 / API 52321: 2943 pass / 96 skip / 0 fail, 9086 assertions, 507 files, 55.32s, exit 0. Skips remain not-run; dedicated clone tests above ran separately.
- `bun run typecheck`, `bun run lint`, `bun run build`: all exit 0; lint 52 warnings. Build synthetic keys / loopback 54329. Generated route tree unchanged, exit 0.
- `node --test scripts/ci/supabase-fixture.test.mjs`: 1 pass / 0 fail / exit 0.
- `node scripts/verify-public-listing-review.mjs`: actual AnimalGrid/Card/Photo in loopback-only synthetic fixture 56552, exit 0 at 390/768/1366px and 200% zoom at 768. Keyboard next page, previous page, name search and clear passed; 16 cards/page, first image eager/high-priority and next image lazy, private marker absent, no overflow/page errors. Screenshots `ui/t21-public-listing-sequential-{390,768,1366}.png`; server stopped. This component check uses the existing pure projection; DB behavior is covered separately above.

## Release / rollback / external gates

Production migration: not applied; explicit exact-file approval required. Schema before code, preceded by catalog/hash/grant checks and backup verification; record actual provider migration identity, preserve ledger history. Postflight requires generated-column/index validity, public RPC grants, anon result/no-private-data checks and unchanged old-field row hash. Keep image transformations disabled until provider plan/quota and operational approval.

Rollback application retains additive column/indexes/RPC and historical age text; the previous app can select its old columns. Do not drop the stored column or restore a stale full database over newer edits. Existing restricted DPAPI backup is documented in the preceding release packages; full restore and Storage bytes remain outside that evidence. Real staff/browser identity journeys and live thumbnail service remain not-run. Wider R01 compatibility is not closed by this page RPC.
