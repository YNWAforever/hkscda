# T24 · UAT and before/after evidence matrix

## Current sequential verification — 2026-09-30

Current candidate source c685b23b8ff18af8a73af858f51f48e7bb1f6f91; production #155 at24196faf, READY. Current local source:3006pass121skip/9383assert/exit0; separate typecheck/lint/build0. PR162 six clone DBtests39assertions; 1000 animal outcomes796success202skip2conflict with unchanged animal fields. PR161 six clone DBtests38assertions and 1000 pre-version-row backfill; PR160 four/30; PR159 four/35. Actual service-role/denied-role, atomic audit, concurrency and three-width synthetic UI results are linked in their sequential-merge reports. These do not replace hosted actual-role/private-file UAT.

Actual local Supabase Auth v2.197.0 and Mailpit were tested for #156. Concurrent reuse of one OTP produced two sessions (expected one), exit1; this is the current release blocker. Sequential reuse, wrong identity, expiry and suspension checks passed. Recovery stays disabled. Payment provider sandbox, real refunds, hosted notification sending and complete hosted journeys are not-run.

Latest comparable #155 10k loopback run:p50/p95 221.73/306.33ms→17.56/29.49ms,11→1calls,4787800→15285bytes. This is not production or regional browser latency. Current #159–#162 component screenshots include before/after390/768/1366, keyboard/200%zoom, interrupted apply/recovery/CSV, zero Axe/page errors. Full final-source hosted Lighthouse comparison remains not-run.

## Historical 2026-09-29 package snapshot

The following original matrix and measurements describe the earlier e3ebbb47 source, not current release state. Later sequential reports above supersede its counts and pending-status claims; historical performance values remain valid only for their stated environment.

| Journey / role | Executed result | Required acceptance still not-run / blocked |
|---|---|---|
| Public adoption | #133 approved-seed revision-read fallback regression; #140 explicit seven-day opt-in draft; #161 isolated assignment 3 pass/18 assertions, including stale version and closing stage. | Real instructions→3-animal shortlist→seven steps→upload→submit→staff receipt; permission error, animal withdrawal, duplicate submit and status-token expiry in hosted candidate. |
| Sponsorship | #139 null challenge normalization; #141 draft; #142 payment choices, terms SHA gate, 260 focused pass/1 skip and 390px body overflow 573→390. Proof/409 paths remain separately guarded. | Association-approved terms PDF and copy; real provider sandbox proof/payment/partial/duplicate/refund and staffed match/renewal. No terms were published. |
| Volunteers | #151 14/30-day coverage plus honest empty state and container; #152 safe bulk preview and sequential draft generation; #160 reviewer assignment 2 local DB pass/14 assertions. | Approved 14/30-day sessions/policy, email sink, two concurrent bookings, real-role 30-day planning, 1000 select with hosted role revocation, worker crash/retry. |
| Supporter | #156 generic recovery request; #157 ownership projection, receipt authorization and explicit audited preference; isolated SQL 3 pass and CI five gates passed at `ef59ca3`. #159 tag bulk 2 DB pass/16 assertions. | Hosted OTP settings/email sink, token expiry/reuse, real private receipt download and logout/cache, ambiguous legacy identities. |
| Finance | #135 server checkout policy, #136 immutable instructions, #137 committed payment versus receipt/email states, #138 HKT date/font reuse. No live method enabled. | Every intended provider's actual sandbox signature/cancel/timeout/out-of-order/amount/refund/PDF/email failure and durable event replay. Credentials and approval missing. |
| CMS / content | #143 dirty-tab guard; #144 paged history; #145 estate version; #146 atomic fee reorder; #153 classification/content eligibility; #162 draft review bulk 3 DB pass/18 assertions including audit failure rollback. | Real staff preview/publish/restore and 1002 revisions; content owner ID-by-ID classification, media ownership, live visibility and real-role browser UAT. |
| Admin roles / direct API | #148 private export jobs 3 DB pass/145 assertions (5,001 synthetic supporters/donations, claim fence, grants); #149 stale edit 3 DB pass/13; #159–#162 admin/staff API and grant tests. | All actual roles in `src/lib/admin/access.ts` tested against hosted direct API, export and private files; role revocation/cache residual in real session. |
| Bulk / worker | #159 CRM 25/1000 and per-item version checks; #160 reviewer role/retry; #161 adoption row-version and stage race; #162 animal publication/classification race, duplicate apply, actor downgrade, expiry and forced audit failure rollback. #154 media starvation/fencing has 2 DB pass/450 assertions. | Other T23 domain operations, 500 media jobs, 100 receipt jobs, worker crash/lease replay, 1000-selection across every domain and real notification recipient preview. |
| Responsive / a11y | Synthetic T16 390/768/1366 and 200% zoom captures; T17 bulk captures; #142 sponsorship 390px overflow fixed. CI brand/a11y at #161 passed. | Real role/mobile/keyboard UAT at source freeze; shortlist/contact overlap, modal focus and error focus across complete journeys. |

## Comparable UI and performance evidence

The initial same-host comparison used browser 148.0.7778.96, read-only synthetic PostgREST fixture `supabase-ci-v1`, three Lighthouse cold runs per route/viewport, baseline production-source `f8d5e5d` versus early T01/T02 source. It **does not measure the final T23 source or production**. Full run-level values and screenshots are in `performance-runs.csv`, `performance-comparison.csv`, `ui-performance.md`, and `ui/`.

| Route, viewport | Score before→after | LCP ms before→after | TBT ms before→after | CLS before→after |
|---|---:|---:|---:|---:|
| `/`, 390×844 | 97→93 | 2404→2545 | 43→60 | .0008→.0008 |
| `/adoption/apply`, 390×844 | 99→100 | 1710→1650 | 66→46 | .0176→.0176 |
| `/animals/cat`, 390×844 | 98→99 | 2010→1950 | 88→89 | 0→0 |
| `/donate`, 390×844 | 99→99 | 1967→1964 | 39→64 | .0001→.0001 |
| `/`, 1440×900 | 99→99 | 753→730 | 0→2 | .0003→.0003 |
| `/animals/cat`, 1440×900 | 99→99 | 730→676 | 0→0 | .0001→.0001 |

Mobile homepage score regressed 4 points in that early comparison; investigate on the same final SHA before release. Mobile instructions/donation before/after screenshots were byte-identical; desktop donation bytes differ without established visual cause, so no improvement is claimed. T21 10k-row loopback DB/client warm p50/p95 improved 269.26/1478.72 ms→19.81/77.06 ms, 11→1 DB calls and 4,787,800→15,285 JSON bytes per 25-card page; this is not hosted browser latency. T20 same-SHA iad1 versus sin1 private benchmark is not-run. #138 100-PDF synthetic benchmark changed 100→1 font fetch, but 103,335→104,233 ms and unchanged 4,338,654-byte sample; no CPU/size improvement is claimed and rare `𠮷` remains uncovered.

## Exit/status evidence

- T23 final local animal source: `npm.cmd run typecheck` exit 0; `npm.cmd run lint` exit 0 (52 warnings); `npm.cmd run build` exit 0; `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` exit 0, 2870 pass/100 skip/0 fail/8914 assertions across 513 files before final test-only role assertion.
- Dedicated loopback DB after final role assertion: `ANIMAL_REVIEW_BULK_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test --isolate src/lib/contentReview/animalBulk.database.test.ts` exit 0, 3 pass/18 assertions. Fixture rolls back. `CHECK_RELEASE_SCHEMA_DATABASE_URL` checker exit 0, 109 compatible, zero issues.
- Same-source remote CI #162 run `36345471697`: verify, RLS, a11y and performance passed; brand pending at capture. Real provider, real email sink and hosted role/browser UAT: **not-run**.

## PR165 isolated acceptance

Actual commands/source/exit codes,4DBtests29assertions plusCRM17tests90assertions,6syntheticlegacyfullSQLdrill,three-width before/after and external not-run gates: sequential-merge-165-20260930.md. No hosted or provider success inferred.

PR162 selection-generation backport61e8952f verified:3006pass121skip/9383assertions/45.61s;typecheck/lint/build0;actual queue delayed-kind-cycle regression red25 to green0;SQL unchanged. Current source/CI metadata supersede earlier capture; remote gates pending.

## PR166 isolated acceptance

See sequential-merge-166-20260930.md for exact source/commands/exit codes, actual-role DB/pagination/unchanged-data proof,3-width before-after and current query timings. Hosted/provider/fullrestore remain not-run.


## PR167 verified read queue (2026-09-30)

See sequential-merge-167-20260930.md for exact commands, source SHA, local PostgREST and three-width browser evidence. No new migration; not deployed. Pending proofs are filtered before count/page, including active pledges with later proofs. Staff review each current proof; no bulk money approval. Earlier #156 OTP release blocker remains. #165/#166 exact schema questions now pending after five green CI gates.


## PR168 readiness verification (2026-09-30)

See sequential-merge-168-20260930.md. Final3051pass/133skip, strict typecheck/lint/build0 and actual three-width SSR/client navigation/Axe0. Server-generated references correlate for client navigation; transport failures do not invent a reference. Stable section IDs tolerate approved CMS copy edits. No migration or schedule activation. #167 fivegreenCI36640615081; #168 freshCI pending; ordered #156 gate and predecessor schema approval questions remain.
