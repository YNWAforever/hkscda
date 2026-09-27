# T24 · UAT and before/after evidence matrix

All results below are **isolated synthetic/local** unless explicitly named. The source freeze is `74c032aeb42fa335080ec582855f0e205abee3c1`. Production and private candidate UAT were not performed. `not-run` is distinct from a passed unit/fixture test.

| Journey / role | Executed result | Required acceptance still not-run / blocked |
|---|---|---|
| Public adoption | #133 approved-seed revision-read fallback regression; #140 explicit seven-day opt-in draft; #161 isolated assignment 3 pass/18 assertions, including stale version and closing stage. | Real instructions→3-animal shortlist→seven steps→upload→submit→staff receipt; permission error, animal withdrawal, duplicate submit and status-token expiry in hosted candidate. |
| Sponsorship | #139 null challenge normalization; #141 draft; #142 payment choices, terms SHA gate, 260 focused pass/1 skip and 390px body overflow 573→390. Proof/409 paths remain separately guarded. | Association-approved terms PDF and copy; real provider sandbox proof/payment/partial/duplicate/refund and staffed match/renewal. No terms were published. |
| Volunteers | #151 14/30-day coverage plus honest empty state and container; #152 safe bulk preview and sequential draft generation; #160 reviewer assignment 2 local DB pass/14 assertions. | Approved 14/30-day sessions/policy, email sink, two concurrent bookings, real-role 30-day planning, 1000 select with hosted role revocation, worker crash/retry. |
| Supporter | #156 generic recovery request; #157 ownership projection, receipt authorization and explicit audited preference; isolated SQL 3 pass and CI five gates passed at `ef59ca3`. #159 tag bulk 2 DB pass/16 assertions. | Hosted OTP settings/email sink, token expiry/reuse, real private receipt download and logout/cache, ambiguous legacy identities. |
| Finance | #135 server checkout policy, #136 immutable instructions, #137 committed payment versus receipt/email states, #138 HKT date/font reuse; #165 atomic manual payment/donation/audit/job and unique normalized bank reference. Dedicated DB 2 pass/13 assertions; corrected CRM fixture 17 pass/90; post-commit delivery failure returns a retryable job. No live method enabled. | Every intended provider's actual sandbox signature/cancel/timeout/out-of-order/amount/refund/PDF/email failure and durable event replay. Credentials and approval missing. |
| CMS / content | #143 dirty-tab guard; #144 paged history; #145 estate version; #146 atomic fee reorder; #153 classification/content eligibility; #162 animal draft review 3 DB pass/18; #164 CMS draft review 3 DB pass/18 including audit failure rollback. | Real staff preview/publish/restore and 1002 revisions; content owner ID-by-ID classification, media ownership, live visibility and real-role browser UAT. |
| Admin roles / direct API | #148 private export jobs 3 DB pass/145 assertions (5,001 synthetic supporters/donations, claim fence, grants); #149 stale edit 3 DB pass/13; #159–#162 admin/staff API and grant tests. | All actual roles in `src/lib/admin/access.ts` tested against hosted direct API, export and private files; role revocation/cache residual in real session. |
| Bulk / worker | #159 CRM 25/1000 and per-item version checks; #160 reviewer role/retry; #161 adoption row-version and stage race; #162 animal publication/classification race, duplicate apply, actor downgrade, expiry and forced audit failure rollback. #154 media starvation/fencing has 2 DB pass/450 assertions. | Other T23 domain operations, bank-file dry-run/group confirmation, 500 media jobs, 100 receipt jobs, worker crash/lease replay, 1000-selection across every domain and real notification recipient preview. |
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

- T23 finance source: `npm.cmd run typecheck` exit 0; `npm.cmd run lint` exit 0 (52 warnings); `npm.cmd run build` exit 0; `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` exit 0, 2877 pass/105 skip/0 fail/8956 assertions across 517 files.
- Dedicated loopback DB: `MANUAL_FINANCE_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES=1 bun test --isolate src/lib/donations/manualAtomic.database.test.ts` exit 0, 2 pass/13 assertions; rollback-only fixture with the untracked local trigger disabled inside the transaction. `CHECK_RELEASE_SCHEMA_DATABASE_URL` checker exit 0, 115 compatible, zero issues. Local security advisor error level exit 0, zero findings.
- Same-source remote CI #165 corrected run `36350007831`: all five jobs passed (verify, brand, a11y, RLS matrix, performance). Initial #165 RLS job failed because separate synthetic gifts reused one bank reference; corrected CRM fixture passed locally 17/17. Parent #164 documentation-head run `36347285026` passed. Real provider, real email sink and hosted role/browser UAT: **not-run**.
