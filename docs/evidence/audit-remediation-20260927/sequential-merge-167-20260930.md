# PR167 sequential verification - 2026-09-30 HKT

Application source `c1f3ef7c2563b4a64c0007ef52c42e68f27cac6c`; integrated verified PR166 `efb8aba86575d28b41e5adc7a27b113caf921672`. This PR adds only a pending-proof read filter and URL navigation; no migration or production configuration change. Independent scoped review found no actionable defects. ADMIN-04 remains partial because later T23 workflows and hosted staff UAT are outstanding.

## Actual verification

| Command | Environment/source | Result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | `c1f3ef7c2563b4a64c0007ef52c42e68f27cac6c`; CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3028 pass /133 skip /0 fail;9480 assertions;546 files;23.45s /0 |
| `npm.cmd run typecheck` | strict TS, same source |0 |
| `npm.cmd run lint` | full configured tree |0;52 warnings |
| `npm.cmd run build` | synthetic keys and loopback54329 |0 |
| `bun test --isolate src/lib/sponsorshipAdmin src/components/admin/sponsorship/PledgeReviewLane.test.tsx src/components/admin/sponsorship/pledgeReviewLogic.test.ts src/lib/operations/taskOverview.server.test.ts` | same source; injectable authorization/API/private-proof regressions |205 pass /1 skip /0 fail;369 assertions;14 files;521ms /0 |
| `SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES=1 bun scripts/verify-sponsorship-proof-local.ts` | fixed unlinked stack supabase_db_hkscda-audit-integration-573, DB57322/PostgREST57321; synthetic data only |100 pledges/232 proofs;66 matching parents once each over7 pages;33 active+search matches; oldest pending detail and exact pledge/proof/revision signing binding; unchanged proof hash /0 |
| `node scripts/verify-sponsorship-proof-review.mjs` | actual component/provider, synthetic API only; loopback56565 |390/768/1366; keyboard paging, URL filters/back/forward/reload, page reset, search kept out of URL, 503 retry recovery;0 writes/Axe0/errors0/overflowfalse /0 |
| committed Git LF migration hash validation | carried54-entry manifest |54/54 /0 |
| `git fetch origin main` | GitHub |0; origin/main24196faf027998388eff3196a6979e23566e2443 |

## Scope of database proof

PostgREST uses the existing full local acceptance database, not the production catalog clone. Historical approved proofs plus two later pending proofs on a single pledge did not duplicate its parent row or count. Approved-only pledges are excluded before parent paging. Existing summary mapping omits private proof IDs and paths. Detail selected the earliest pending proof (Sep2) despite the newest proof being Sep3. Wrong pledge or revision returned no signing information. This checks private-path binding, not a hosted Storage download or end-to-end user session.

A page beyond the result range returns the existing explicit PGRST103 error; it was asserted as such, not described as an empty page or a passing UI data load. Initial harness runs exited1 because they signed with a local JWKS string rather than the local Auth HMAC key, and assumed an empty beyond-range page. Corrected harnesses retained actual database constraints. The temporary browser fixture initially lacked its language provider and used a nonlocal Vite entry; only the fixture was corrected. Application source was unchanged by these acceptance steps.

Fixture creation naturally produced232 synthetic message/outbox rows without invoking a delivery worker. Cleanup removed only the fixture supporter/pledges/proofs and linked messages/outbox inside a transaction. The history-protection trigger was disabled only for exact fixture cleanup and reenabled before commit; independently checked enabled afterward. Final pledge/proof/outbox/message counts0. No real provider, email, payment, refund or Storage bytes were involved. All tested proof fields remained unchanged before cleanup.

Current-only local page durations24.14/5.01/6.67/5.10/5.66/7.71/5.99ms on the final run are not a before/after performance claim. Entry/filtered screenshots: `ui/t23-proof-queue-{entry,filtered}-{390,768,1366}.png`; these show current states, not an invented before-fix baseline. Existing original red/green source evidence is preserved in t23-sponsorship-proof-queue.md. Full hosted roles/private download/browser journeys, provider sandbox, live delivery and before/after performance are not-run; skips are not passes.

## Release and rollback

Code complete for this slice; no new schema required by #167, but parent schema approvals remain pending. Not deployed or operationally enabled. #134-#155 merged22/46; #156 real concurrent OTP redemption test still blocks ordered merge. The proposed disabled-feature exception has no answer and is not approval. #157 exact SQL approved, #159-#162/#164/#165/#166 questions pending. Current #162-#166 heads each have five SUCCESS gates (runs36638004101/36638012496/36638400463/36638481186/36638779965 respectively). #167 fresh remote CI awaits this push.

Staff may open the pending-proof queue and review the current exact proof; an active pledge can have a later month's outstanding proof. An uploaded proof is not money received. There is no bulk finance approval. On conflict refresh detail; use existing finance authorization and revision checks. Revert this application slice to the normal list if necessary; preserve financial/audit history and all additive parent schema. Payments/new schedules remain disabled. Existing webhook/reconciliation remain intact.
