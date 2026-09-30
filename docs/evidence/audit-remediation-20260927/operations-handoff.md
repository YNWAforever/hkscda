# T24 · staff operations and rollback handoff

**Current state (2026-09-30):** #134–#155 merged/deployed (22/46), main/alias 24196faf027998388eff3196a6979e23566e2443 READY, main CI five green. #156 onward not merged: actual local Auth concurrent OTP failure blocks sequential release. New checkout remains disabled; new recovery delivery/media schedules and real content classification remain unenabled. Later #159–#162 bulk interfaces are verified locally but not deployed. Staff continue approved live procedures until the relevant new function is explicitly enabled.

## Staff roles and day-one checks after an approved release

| Owner | Required action / evidence |
|---|---|
| Release owner + DBA | Confirm exact app SHA, migration manifest checksum, production backup/restore test, ordered catalog/signature/grants/RLS/seed gate, compatible rollback target and CI at same SHA. Sequential main release is already approved when gates pass; obtain only outstanding exact production migration and operational activation approvals. |
| Finance treasurer | Approve each payment method, public instructions/config version and account details; inspect sandbox callbacks, pending/uncertain reconciliation, receipt delivery and refund controls. Payment success remains committed even if PDF/email fails. Never bulk-refund or void without per-item review. |
| Content owner | Review exact live IDs, source classification, photo rights, animal mapping, terms/copy diffs and public impact before any publication/archive. #133 fallback is only for CMS revision read `PGRST205`/`42P01`; permission, unexpected, missing published revision and invalid content stay errors. |
| Volunteer coordinator | Approve policy and 14/30-day activity coverage; review each bulk preview's scope, exceptions and capacity. Confirm notices separately. |
| Admin lead | Exercise each actual role's direct API, export, private media/receipt and revoked-session behavior in private candidate. Train staff on 25 visible / up to 1000 matching selection, expiring snapshots, per-item result CSV, conflict refresh and failed-only retry. Do not assume a bulk job is one atomic multirow command. |
| On-call | Before an approved candidate release, run `READINESS_BASE_URL` + private `READINESS_TOKEN` + `READINESS_EXPECT_SHA` with `bun scripts/verify-live-readiness.ts`; require ready and rendered adoption content. The private endpoint uses `CRON_SECRET`, returns no-store and 503 when unavailable; missing CMS relation is degraded and blocks this strict release gate even while #133 seed copy keeps the page readable. When a visitor reports the adoption-page reference ID, locate the matching code-only loader log; do not request or paste their form payload, address or token. Record worker last success/backlog, webhook replay, pending payments, receipt failures, error rate and public-content smoke before/after release. Keep old provider event intake and reconciliation available while new checkout admission is disabled. |

## Operational workflow for new bulk controls (once approved and deployed)

1. Select a bounded list with its displayed filters; confirm **this page** versus **all matching** and the count. A changed filter invalidates selection. No generic table editor exists.
2. Run preview and read eligible, skipped and conflict reasons, before/after data, expiry and public impact. Do not use an expired snapshot or bypass a version conflict.
3. Apply 25 at a time. Each item rechecks current role and record version; success, skipped, conflict and failed are distinct. Save the per-item result and audit reference. A refreshed tab retains the saved operation ID. Use read recovery after an outage; pending mount recovery blocks a replacement preview.
4. On an uncertain response, first reload durable results and continue still-pending items in the same operation; completed items are idempotent. Re-preview conflicts, expired snapshots or changed scope; never blindly undo completed groups. Notification draft, recipient preview and actual sending are separate approved actions. No workflow automatically publishes an animal or approves an adoption/payment.

## Incident isolation and rollback

- Schema fault or unexpected payment behavior: disable **new checkout** and affected new write endpoints via the reviewed policy/config, preserving prior webhook ingestion, reconciliation and durable provider events. Investigate the exact catalog, error/audit IDs and pending event queue before retry. Never mark a committed payment pending because receipt/email failed.
- Bulk issue: stop the specific UI/API operation, keep operation/result/audit rows, let in-flight per-item transactions settle, inspect succeeded versus failed IDs and perform a new snapshot for unresolved items. Do not blindly replay all IDs.
- Media worker issue: pause new claims, retain leases/checkpoints and committed-public invariant, inspect stuck/permanent failure counts, then resume with fencing intact. Do not expose uncommitted media.
- App rollback: no old app SHA is certified against the complete additive schema. Prove compatibility in a private candidate, leave additive schema/data in place, and roll app/config only. Do not restore an older DB over newer payment/audit/events.
- Sequential main release approval is recorded; exact production DDL approvals apply only to their named files. Publishing, payment enablement, new schedules, sending and refunds remain separately gated.

## Outstanding inputs for release owners

- Current production catalog snapshot, grants/RLS/storage policies and sanitized data-bearing clone for the remaining per-PR changes; 51 source files are inventoried. Existing restricted backup has no Storage bytes and full restore remains not-run.
- Approved payment policy/methods/instructions, provider sandbox credentials/account and webhook replay evidence; approved sponsorship terms PDF/hash, cancellation/refund copy.
- Approved animal/story/photo ID list and rights, volunteer policy/session coverage, real content/seed diff, private candidate URL and test identities for every admin role.
- Supported Auth atomic OTP redemption fix and hosted parity; local Mailpit sink already exercised; monitoring/alert thresholds, five-minute worker/cron ownership, private regional benchmark, 390/768/1366 keyboard/200% UAT.
- Remaining T23 domain implementations: sponsorship, finance, CMS and additional volunteer/adoption/animal/CRM safe actions. `tracker.csv` keeps ADMIN-04 partial.

## Manual settlement recovery

After a lost response retry the same payment and exact original reference. Only an identical committed request recovers its existing delivery job; a different reference is a conflict. Delivery busy reads its durable status, including complete/attention_required; retry from the job without another credit. Duplicate reference409 needs finance investigation. Keep new schedules disabled pending separate approval.

## CMS quality queues

Demo/expired/missing-source queues are read-only and overlap. Review each source; changing filters clears selected draft IDs and invalidates unfinished selection. Quality errors allow return to all-items. No automatic classification/unpublication. Apply no production migration until exact approved dependency preflight.


## PR167 verified read queue (2026-09-30)

See sequential-merge-167-20260930.md for exact commands, source SHA, local PostgREST and three-width browser evidence. No new migration; not deployed. Pending proofs are filtered before count/page, including active pledges with later proofs. Staff review each current proof; no bulk money approval. Earlier #156 OTP release blocker remains. #165/#166 exact schema questions now pending after five green CI gates.


## PR168 readiness verification (2026-09-30)

See sequential-merge-168-20260930.md. Final3051pass/133skip, strict typecheck/lint/build0 and actual three-width SSR/client navigation/Axe0. Server-generated references correlate for client navigation; transport failures do not invent a reference. Stable section IDs tolerate approved CMS copy edits. No migration or schedule activation. #167 fivegreenCI36640615081; #168 freshCI pending; ordered #156 gate and predecessor schema approval questions remain.


## PR169 preparation — 2026-09-30

PR169: saved indicates committed assignment; failed refresh never undoes it. Unknown retry retains original owner/version; conflict requires inspecting current owner and explicit selection. Eligible staff/admin only; current Auth is rechecked by DB. No proof/payment approval, email, refund or schedule.


## PR170 preparation — 2026-09-30

PR170 recovery GET failure retains operationID; reload results before resuming pending items. Filters clear selection. Expired operation requires explicit fresh snapshot for unresolved items, keeping prior results. No proof/payment approval or notifications.


## PR171 preparation — 2026-09-30

PR171 draft is ephemeral: current status,recipient,proof or month/allocation changes clear it; regenerate after reviewing facts. Pending proof/adjustment requiresfinance review. No send action or approved payment instructions. Sending requires separate authorization.


## PR172 current preparation — 2026-09-30

See [sequential-merge-172-20260930.md](sequential-merge-172-20260930.md) for finalapp `0af5599648949238d1244a7625b22d0f50baa35f`, four reproduced fixes,16focused/56assertions,3099full passes/142skips, type/lint/build0, service_role/fullSQL rehearsal,3width before/after UI and exact release boundaries.57-file inventory; codecomplete/local-schema-ready,notdeployed/notenabled. Sequential release remains blocked at#156.


## PR173 current preparation — 2026-09-30

See [sequential-merge-173-20260930.md](sequential-merge-173-20260930.md): app `40a8765beaa04613fae1f9cc77e74a11d34810f1`, rejected-retry/lost-response/page1000/keyboard fixes;17focused/88assertions,3110fullpasses143skips,type/lint/build0; real concurrent one-audit retry and1000job pagination;3width UI/Axe0.58-fileinventory,local-schema-ready,notdeployed/notenabled;#156releaseblock retained.


## PR174 current preparation — 2026-09-30

See [sequential-merge-174-20260930.md](sequential-merge-174-20260930.md): app `ea7541079ca3cd3c0390f9f3bef1a8665b4746f2`, treasury guidance corrected without permission expansion. Full3113pass143skip9802assertions;type/lint/build0;actualisolatedAuth/API3roles;9browsercases/Axe0,12screenshots.58inheritedSQLfiles,no newmigration. Codecomplete slice,notdeployed/notenabled;#156remains releaseblock. #172fivegreen andexactapprovalrequested;#173CIpending.


## PR175 current preparation — 2026-09-30

See [sequential-merge-175-20260930.md](sequential-merge-175-20260930.md): app `04d673b8ef64d690ed75bf47cdc0175aefed5b02`, serialized/actor-scoped snapshotrecovery andpaginationfixes. Full3125pass145skip9862assertions;19focused86assertions;type/lint/build0withexplicitfinal-counterclarificationboundary;1000syntheticresult897success100skip3conflict/auditrollback;12browsercases/Axe0.59-fileinventory;local-schema-ready,notdeployed/notenabled. #172–#174fivegreen;#156releaseblockretained.


## PR176 current preparation — 2026-09-30

See [sequential-merge-176-20260930.md](sequential-merge-176-20260930.md): app `82c62c7a46994f12f413b946d099a6e7a8bc263b`, stale response/invalid JSON/keyboard fixes. Full 3136 pass / 145 skip; 13 focused / 52 assertions; typecheck/lint/build exit 0. Actual isolated Auth/PostgREST 1000-selection role/read-only verification and three-width before/after UI, Axe0. No new SQL; 59 inherited migration files. Code-complete slice, not deployed or enabled; #156 release blocker remains. #175 exact-head five gates green.
