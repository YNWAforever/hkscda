# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T17 were implemented as stacked draft PRs #135–#152 on successor branches; see individual PR evidence. Later tasks have separate status entries below. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

- T18: code/schema implemented in draft PR #153, source commit 434ec6a38d2ddbd02e7250c18b2cf6b62413ba3c; exact seven-record read-only production review list, SQL eligibility/metadata, ended-event UI, photo queue and optional sponsor facts. Production classification, migration, replacement content and T21 filters remain open. See `t18-content-eligibility.md`.

- T19: code and additive schema ready in draft PR #154 (9b40e5a), stacked on #153; R08 fairness/fencing and staff queue tested. Five-minute cron, production migration and live metrics are not enabled. See t19-media-repair.md.

- T20: production server iad1 and DB ap-southeast-1 verified; same-SHA private-region benchmark and switch not-run. See region-benchmark.md.
- T21: public listing code/schema ready in draft PR #155, source 8352adfaa88ed6655f906571bb9c7397ec3f7329, with 10k parity/RLS and 30-sample local DB comparison. Production migration and paid image transforms remain disabled. See t21-public-pagination.md.

- T22 recovery: draft PR #156, source 3b5941b2b37860f0cfdc33cfe20a8c9072e19346; generic OTP request and public entry tested. CRM-01 partial until verified-record portal; hosted OTP settings and email sink not-run.

- T22 portal: verified records and private receipt authorization, explicit audited marketing preference. Source commit/PR pending. Full isolated suite 2844 pass, 89 skip, 0 fail; typecheck/lint/build exit 0; disposable catalog 87 compatible with manual unledgered local function. Real OTP email sink, hosted settings, status-link reissue and browser journey remain open; CRM-01 partial.

- T22 portal: draft PR #157 source ef59ca34b885822b9837aae3beee6ef0ad994db8; verify, brand, a11y, RLS and performance CI passed at that SHA. CRM-01 remains partial for hosted OTP/email sink/browser and ambiguous legacy records.
- T23 overview: read-only role-based task cards in progress; direct API/access/UI tests 4 pass and 11 metric queries executed against dedicated local PostgREST. Cross-domain bulk and filter-preserving links remain open.

- T23 overview verification: local typecheck/lint/build exit 0; isolated full suite 2849 pass 90 skip 0 fail after sequential rerun; 11 local PostgREST metric queries pass. An initial concurrent run timed out only in the unrelated migration safety scan (targeted rerun 1/1 pass).

- T23 CRM bulk slice: code/schema prepared on branch `codex/audit-bulk-review-20260928`, draft PR #159 source 8e7cd063c4ec588d3e96260ce0712fe843ae4291. Supports 25 visible or up to 1000 filtered supporters, immutable preview, per-item role/version check, 25-at-a-time apply, skip/conflict/result CSV and tab recovery. Dedicated local DB tests 2 pass/16 assertions; focused selection/API/UI 6 pass/27 assertions; 92-item catalog compatible. All production and cross-domain bulk remain open. Full release gates pending at this point.
- T23 CRM bulk dedicated-stack full suite: 2855 pass, 92 skip, 0 fail across 503 files. Initial default-old-stack run failed six unrelated RLS/document-slot assertions plus one CSV test edited concurrently; focused CSV and dedicated rerun pass. Final SQL checksum f106bf0 rehearsed in BEGIN/ROLLBACK.
- T03: server admission and donor projection implemented on `codex/audit-payment-policy-20260927`; migration applied only to dedicated loopback DB. New policy defaults disabled, with zero approved methods. Focused and isolated grant/replay tests pass; provider sandbox success/cancel/delay and operational approval remain not-run. PR is a review slice, not a release approval.
- T04: code-complete on `codex/audit-payment-instructions-20260927`: donation admission and sponsorship pledge instruction snapshots are durable; both API and email use approved purpose/version data; changed or revoked config suppresses old instructions while keeping evidence. Hard-coded account/link output removed. Dedicated isolated DB and email sink pass. Real approved content, provider sandbox and release activation remain external gates.
- T05: partial on `codex/audit-payment-lifecycle-20260927`: committed payment status and receipt/notification status are separate; a new donation-success trigger queues durable delivery with audit, protected hourly cron runs bounded batches, and PDF/email failures leave payment succeeded. Isolated DB trigger/grant test passes. Provider sandbox and historical data-bearing recovery rehearsal remain not-run; no operational enablement.
- T06: HKT receipt date and process-level single-flight font-byte cache implemented on `codex/audit-receipt-date-font-20260927`. UTC midnight/year-end tests and 100-PDF same-host benchmark pass. Font fetches 100→1; wall time and ~4.34 MB size did not improve. Rare glyph U+20BB7 is absent from the bundled font; alternate font/size remains open.
- T07: sponsorship proof challenge compatibility implemented on `codex/audit-proof-token-20260927`; absent token omission and legacy-null normalization are red-to-green, with signed-intent/fail-closed/replay regression coverage. Browser/provider UAT remains not-run.
- T08: explicit payment choice, proof validation, published PDF checksum consent gate, stale-version rejection, total-monthly/manual arrangement summary and actionable error states implemented on `codex/audit-sponsorship-commitment-20260927`. The new migration passed an isolated loopback dry run and rolled-back RLS/grant test; 67-object compatibility check exit 0. Bounded full suite: 2846 pass/86 skip/0 fail, exit 0. Synthetic 390px keyboard/payment-error UAT passed, with body-width red 573px → green 390px; existing floating shortlist overlap remains T24. Association-approved terms, audited slot assignment, end-to-end submission UAT and release approval remain open; no live publication.
- T09: opt-in seven-day versioned drafts, explicit restore/clear, data whitelists, photo re-selection, preparation checklist and final review changes implemented on `codex/audit-safe-drafts-20260927`. Full isolated suite 2834 pass/86 skip/0 fail; synthetic 390px mobile restore/clear browser UAT exit 0. Full eligibility/submission UAT and seven-day policy approval remain open.
- T10 / R03: code complete in draft PR #143, commit 62e22692d69b41135f705672c940976825281b53; synthetic browser and full isolated suite passed. No schema change or deployment. See t10-cms-unsaved.md.
- T11 / R04: code complete in draft PR #144, commit 558f191c4ff8b801bf4a758aef37d38118b3b528; bounded summaries, direct revision reads, role/no-store and isolated DB rollback passed. No schema change or deployment. See t11-cms-history.md.
- T12 / R05: versioned estate create/content/publication commands and additive audited SQL migration prepared in the independent branch codex/audit-estate-version-20260927. Red 0/3 to green 3/3, focused 76/76, full isolated 2794 pass/83 skip, rollback-only DB drill and synthetic mobile browser passed. Draft PR #145, source commit 60ed2d612d7b426d3d4641f6cbabf66f978d1486; release approval pending; no production DDL or deploy. See t12-estate-version.md.
- T13–T24: see separate PRs; not implemented in this branch. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

## T14 branch continuation

Draft #147 contains the immediate-export UI repair. This branch adds the independent background-export job: actor-bound filter snapshot, private 24-hour artifact, 500-row atomic progress, role reauthorization, cancellation fencing and expiry cleanup. See [T14 evidence](t14-background-export.md). The local DB/schema and synthetic UI checks passed; production migration, cron activation, real role UAT and release approval remain open. Other task slices are in separate draft PR branches, so rows above describe their original T00 worktree snapshot rather than the whole remediation programme.

## T15 branch continuation

Draft #149 addresses ADMIN-02 in an isolated branch: fresh supporter read on open, dirty-close guard, versioned atomic mutation and 409 conflict response. Its local synthetic browser and isolated DB tests passed; production schema, real test-identity UAT and release approval remain open. ADMIN-03 and later tasks remain separate. The original rows above describe this plan's T00 snapshot, not the whole remediation programme.

## Sequential release continuation — 2026-09-30

#134–#152 have merged sequentially (19/46), with each PR and its predecessor main CI checked before merge. #152 production READY; its main CI pending. T18/#153 archive leakage and migration identity collision repaired; local code/UI checks passed, current schema rehearsal and remote gates pending. See sequential-merge-153-20260930.md. Historical entries above are retained.

- T22 sequential #156: activation gate, challenge reset, pending verification lock and local OTP templates repaired. Full 2964 pass/96 skip/0 fail; typecheck/lint/build 0. Actual isolated Auth sink concurrent OTP check fails (two sessions). Recovery remains disabled and not merge-ready under all-tests-green. See sequential-merge-156-20260930.md.

- T22 sequential #157: identity/unmount fencing, preference error statuses and withdrawal ordering repaired at 09a2d1c. Full 2975 pass/100 skip/0 fail; typecheck/lint 0; isolated service-role/atomic-audit/concurrency 5 tests pass; three-width UI/Axe pass. Production RPC absent and exact approval pending; #156 Auth concurrency remains blocked. See sequential-merge-157-20260930.md.

- T23 sequential #158: current-identity query isolation repaired at 40a01915; full 2980 pass/101 skip/0 fail and typecheck/lint/build 0. Three-role isolated Auth/PostgREST API check, 11 metric queries, responsive browser and Axe checks passed. No schema change or deployment; exact filters and later bulk slices remain open. See sequential-merge-158-20260930.md.

- T23 sequential #159: actor authorization race, transient recovery loss, keyboard scrolling and JSON status repaired at baf92b18. Full 2987 pass/105 skip/0 fail; typecheck/lint/build 0; actual service-role clone 4 tests/35 assertions includes 1000 rows and concurrent retry; three-width UI/Axe passes. Production migration approval pending; see sequential-merge-159-20260930.md.

- T23 volunteer reviewer slice: in progress on `codex/audit-volunteer-review-bulk-20260928`. Narrow admin-only reviewer assignment, no eligibility/status changes. Dedicated local DB 2 pass/14 assertions; focused directory/selection/API 7 pass/30 assertions; 98-item catalog compatible. Full gates and PR pending; ADMIN-04 remains partial across other domains.
- T23 volunteer reviewer final local verification: 8 focused pass/32 assertions after red-to-green 1001st-item selection guard; dedicated DB 2 pass/14 assertions; full isolated suite 2860 pass/94 skip/0 fail across 506 files; typecheck, lint, build exit 0 (lint 52 existing warnings). Draft PR #160 source d6b540d opened; remote CI pending. Parent CRM bulk #159 CI run 36339607930 passed verify, RLS, performance, brand and a11y.

- PR160 sequential repair cf09870b: permission locks, JSON400 and durable recovery; 2993 pass/109 skip; typecheck/lint/build0; clone4tests30assertions; 3-width UI/Axe0. Current remote CI/review and exact production approval pending; #156 provider concurrency remains a predecessor gate.

- T23 adoption assignment slice in progress on isolated branch: dedicated local DB 3 pass/18 assertions after red-to-green timestamp-version and closing-stage races; focused UI/API/selection/manifest 9 pass/66 assertions; schema catalog 104 compatible. Full isolated suite 2865 pass/97 skip/0 fail across 509 files; typecheck/lint/build exit 0 (lint 52 existing warnings). Draft PR #161 source 4f0c4c9 opened; remote CI pending. Volunteer reviewer #160 CI run 36341891052 passed verify, RLS, performance, brand and a11y.

- PR161 sequential repairs d87311ab / a5d3c751: actor/assignee/stage locks, JSON400, durable recovery and default-filter select-all. Final full3000pass115skip/9347assert; typecheck/lint0; clone6tests38assert; 1000-row full SQL backfill and 3-width UI/Axe0. Independent review closed; current CI and exact production migration approval pending. #156 provider gate still blocks sequential release.

- T23 animal editorial review bulk in progress on isolated branch: missing-RPC red/green; dedicated DB 3 pass/18 assertions including role downgrade and audit rollback; focused UI/selection/API 5 pass/22 assertions; catalog 109 compatible. Full isolated suite 2870 pass/100 skip/0 fail across 513 files before final test-only assertion; typecheck/lint/build exit 0. Draft PR and remote CI pending. Parent adoption #161 CI run 36343892629 passed verify, RLS, performance, brand and a11y.

- PR162 sequential repair 1fec4ea6: actor lock, JSON400 and durable read recovery. Full3006pass121skip/9383assert; clone6tests39assertions; 1000-item partial results preserve animal fields; full SQL rollback253ms; 3-width UI/Axe0. Independent review closed. Current CI/production approval and #156 provider gate remain open.

- T23 animal review draft PR #162 source e3ebbb4 opened; run 36345471697 verify/RLS/performance/a11y passed, brand pending at capture. T24 review package prepared on separate branch: 34 issue statuses and 43 migration checksums validated; release NO-GO pending domain, provider, real-role and schema approval gates.

- PR163 sequential release package refresh: live PR inventory confirms22/46merged (#134-#155); all22 main CI runs success, #155aliasREADY. Sourcefreeze#162ae80846b;51unique source checksums match committedbytes. Corrected stale deployed tracker fields and staff recovery workflow. #156actualAuth concurrency blocks nextrelease; exact later migration/activation approvals remain pending.

- Release validation initially found23 stale plan-tracker rows. Synchronized current status/evidence from the live evidence tracker by issue ID, retaining original baseline labels. Repeat validates34 matching current-state rows,51 checksums and46PRs/22successful mainCI runs; exit0.

- PR163 independent review identified stale R01 missing-object counts. Both trackers now label them as2026-09-27baseline, record later partial production dependencies/ledger95, and retain the fresh complete catalog gate; schema-ready remains no.

- T23 CMS draft review batch: missing-RPC red/green; dedicated DB 3 pass/18 assertions; focused UI/API/selection 6 pass/26; catalog 114 compatible. Full isolated suite 2875 pass/103 skip/0 fail across 516 files; build/typecheck/lint exit 0 after test UUID fixture correction. Draft PR and remote CI pending. #162 and #163 five CI jobs each passed. CMS public publication and remaining T23 domains stay open.
- T23 CMS draft review PR #164 source 0c92e7f opened; remote run 36347166456 pending at package refresh. T24 manifest refreshed to 44 verified migration checksums and 114 compatible local catalog requirements; release NO-GO remains.

### 2026-09-30 PR164 follow-up
CMS bulk actor-lock/JSON/recovery/queue races repaired and independently reviewed. DB role/concurrency/audit and1000-item evidence,full SQL unchanged-row drill and3-width UI recorded in sequential-merge-164-20260930.md. Code complete for this slice; schema ready locally only;deployed/operationally-enabled no. #162 unmount backport integrated through#163.

- Historical PR165 source74c032ae CI36350007831 five green; current sequential integration requires new verification. See t23-finance-atomic.md; prior Windows manifest hash superseded by committed LF hash.

## 2026-09-30 PR165

Reproduced/fixed actor revocation race, lost committed response recovery, CRM duplicate-reference409 and durable delivery status on busy. Four findings closed; local gates pass. Code complete for this slice; schema ready only locally;deployed/operationally-enabled no. Exact CI/schema approval pending; original overall task remains in progress.

## 2026-09-30 PR166

Quality queue read regression complete: generation race and400/403mapping repaired;1000-row actual-role pagination preserves all content/audit. Code complete for this slice; schema ready locally only;not deployed or enabled. #162-#165 selection backport propagated. Independent #167 review proceeds.
## T22 recovery broker continuation, 2026-09-30

Implemented the approved purpose-bound/hashed/single-use15-minute fallback after native Auth concurrency failed. Code SHA `4a4eef8e2c5b146c401b442d8b9a8af494049ce2`, local gates and isolated schema ready; production DDL/deployment/enablement remain no. CRM-01 stays partial for #157 portal and external UAT. #134-#155 remain22/46 merged; no new merge or production mutation in this checkpoint. Trackers and manifest updated; [concrete release evidence](sequential-merge-156-broker-20260930.md).

## T22 session review completion, 2026-09-30

Code `ccfca5444dead96d94195e346c15fdfcf2751a7e`: full3004 pass/96 skip/0 fail; typecheck/lint/build exit0; SDK22/66; real two-tab factory,3 recovery logout same-task cases and3width keyboard/Axe0 journey pass. Independent review has no remaining findings. Exact SQL unchanged and re-rehearsed with catalog equality. #156 production DDL remains unapproved; #157 integration code/schema locally verified separately. Still22/46 merged; production main/alias24196faf and recovery/payment/new schedules remain disabled. [Final checkpoint](sequential-merge-156-broker-20260930.md).

## T22 broker/portal final integration, 2026-09-30

Code 9d829324fe639dda8c832c279deac5feee16c5d5 includes reviewed #156 head edd13112. Full3019 pass/96 skip/0 fail/9355 assertions; typecheck/lint/build exit0; actual service-role audit rollback/concurrent preference checks, real two-tab SDK and3width recovery-to-portal UI pass; Axe0. Same-task logout failures remain visible only for the owning session. Independent review clear. #156 exact-head five CI gates green; #157 latest CI requires publication/check. Still22/46 merged. Code-complete=yes; schema-ready=isolated only; deployed=no; operationally-enabled=no. Exact #156 production migration approval pending; #157 preference migration already approved. See sequential-merge-157-20260930.md for commands/environments, screenshots, rollback and not-run gates. This integration manifest has48 entries; no production DDL or ledger mutation occurred.

## T23 dependency continuation, 2026-10-01 HKT

Code7b426c61ab9bfb1085fe5cfad02b83b709d880a5 includes final #157/#156 recovery and portal. T23 source unchanged; routes preserved. Full3024 pass/97 skip/0 fail/9384 assertions; typecheck/lint/build exit0; actual local Auth three-role/API/status checks and3width keyboard/Axe0 task overview pass. Independent review clear. New integrated captures preserve older before/after images. No T23 migration; combined manifest48. Still22/46 merged; exact #156 production schema approval pending; #157 migration already approved. #158 code-complete for overview only, ADMIN-04 partial for later bulk/filter slices; deployed=no, operationally-enabled=no. See sequential-merge-158-20260930.md for exact commands/environments/rollback and not-run gates.


## 2026-10-01 HKT Task161 integration / #159 release checkpoint

Task161 independently approved and final combined source gates passed:3065pass97skip0fail; strict typecheck/lint/serialbuild0,52existing warnings; scope census0. Repaired SQL hashcd143432 preserved. Source predecessor#1609d1feed9 integrated; manifest51/trackers34unique. #159 actual main07e4c881/mainCI36758558621 all5SUCCESS/aliasREADY;26of46released. #160 and changed-byte#161 production approval/deployment remain pending; Task162/164 independently approved before integration. See sequential-merge-161-20260930.md and sequential-execution-20261001.md for actual environment/limits.


Task162 root integration verified2026-10-01HKT: independent review approved; 3079pass97skip0fail9739assertions543files113.24s; strictType/lint/serialBuild0;52oldwarnings;fixture0; hash8f5eceb8 preserved. Source/deployment/enablement separate; remoteCI/schemaapproval/sequence pending.


## 2026-10-01 HKT current sequential checkpoint (supersedes prior status)

26/46requested PRs released through#159; main/production07e4c881863b715342ed0757aad7bd691a272738, mainCI36758558621 all5SUCCESS, READY dpl_D6goofbM7umWWoTqQVGtBxHzkvVP. #157 main publication used corrective#181 after its original dependency-base merge; no migration replay. #156 now uses the reviewed application-owned single-use recovery broker; prior isolated provider OTP race is historical, not the current source blocker. Recovery/sending activation remains separately gated.

Source freeze is reviewed combined PR162 `4d1289e50c9ffe694ff3dab9a2ac74cd9d59c17b`; this PR changes documentation only and excludes later164–179source. Manifest52unique migration files recomputed against actual canonical LF SQL with0mismatches. Updated release-manifest.json and pr-status-20261001.json distinguish source, actual main releases, isolated schema and enablement. Prior20260930report remains historical. Fresh exact-head PR162/PR163 remote gates are pending at this capture; no fresh local full/type/build rerun for identical source in this documentation-only descendant.

Next sequential release holds only at #160's pending single production migration approval. #161's explicit named-file schema/backfill approval remains operative after two strictly narrower wall-clock expiry checks; exact new hashcd143432 disclosed, schema/grants/backfill unchanged. Fresh predecessor main/alias, catalog/signature/grants/RLS/checksum/backup and postflight remain mandatory. #162 and later unapproved production migrations await named approvals; no blanket schema rollout.

Restricted backup refreshed2026-09-30T16:29:12Z: encrypted1,913,782bytes, SHAae4c855334e4685cfc10c289c0be50ae960dc047934128eb8b98da209afb755d. Schema/data/roles were separate in-memory dump processes, not one cross-dump snapshot; CurrentUser DPAPI roundtrip and restricted ACL checked. Full restore, off-machine copy and Storage object bytes remain not-run. Backup precedes156/157/159additive changes; replay exact approved empty-object migrations if recovery requires those objects. Preserve later financial/audit facts and additive history on app rollback; no older snapshot restore over new facts.

Staff: existing deployed overview/CRMtag bulk use stored snapshot→preview→per-item permission/version checks→apply→result/recovery. Expired/stale items require new preview; retry unknown outcomes from the saved operation. Reviewer/adoption/animal/CMS controls remain release-gated in later candidates. No blind refunds/adoption approvals/identity merge. Payments/new recovery/delivery/media schedules remain disabled; existing signed webhook/reconciliation remains compatible. Hosted staff-role API/export/private-file journeys, approved terms/content, provider sandbox/full journeys and same-region hosted T20 are not-run/unverified; null configuration versions remain null.


Task164 root integration verified2026-10-01HKT: independent review approved; 3093pass97skip0fail9830assertions546files115.91s; strictType/lint/serialBuild0;52oldwarnings;fixture0; hashb564a09a preserved. Source/deployment/enablement separate; remoteCI/schemaapproval/sequence pending.

Task165 CODE-ONLY COMPLETE2026-10-01HKT: unchanged reviewed finance source; root3102pass97skip0fail9885assertions547files106.06s; targetedCRM/strictType/lint/serialBuild0;24fixturetables0. RemoteCI/namedDDL/sequence/hosted/provider gates pending. Invalid shared CRM target attempt retained, guard unchanged.
