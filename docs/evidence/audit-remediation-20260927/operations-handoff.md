# T24 · staff operations and rollback handoff

**Current state: review only.** All remediation PRs remain drafts. Production alias still points to original main at last verification. Staff must continue the currently approved production procedures; none of the new bulk, checkout, portal or content functions has been enabled by this package.

## Staff roles and day-one checks after an approved release

| Owner | Required action / evidence |
|---|---|
| Release owner + DBA | Confirm exact app SHA, migration manifest checksum, production backup/restore test, ordered catalog/signature/grants/RLS/seed gate, compatible rollback target and CI at same SHA. Approve private candidate, migration and main merge separately. |
| Finance treasurer | Approve each payment method, public instructions/config version and account details; inspect sandbox callbacks, pending/uncertain reconciliation, receipt delivery and refund controls. Payment success remains committed even if PDF/email fails. Never bulk-refund or void without per-item review. |
| Content owner | Review exact live IDs, source classification, photo rights, animal mapping, terms/copy diffs and public impact before any publication/archive. #133 fallback is only for CMS revision read `PGRST205`/`42P01`; permission, unexpected, missing published revision and invalid content stay errors. |
| Volunteer coordinator | Approve policy and 14/30-day activity coverage; review each bulk preview's scope, exceptions and capacity. Confirm notices separately. |
| Admin lead | Exercise each actual role's direct API, export, private media/receipt and revoked-session behavior in private candidate. Train staff on 25 visible / up to 1000 matching selection, expiring snapshots, per-item result CSV, conflict refresh and failed-only retry. Do not assume a bulk job is one atomic multirow command. |
| On-call | Record worker last success/backlog, webhook replay, pending payments, receipt failures, error rate and public-content smoke before/after release. Keep old provider event intake and reconciliation available while new checkout admission is disabled. |

## Operational workflow for new bulk controls (once approved and deployed)

1. Select a bounded list with its displayed filters; confirm **this page** versus **all matching** and the count. A changed filter invalidates selection. No generic table editor exists.
2. Run preview and read eligible, skipped and conflict reasons, before/after data, expiry and public impact. Do not use an expired snapshot or bypass a version conflict.
3. Apply 25 at a time. Each item rechecks current role and record version; success, skipped, conflict and failed are distinct. Save the per-item result and audit reference. A refreshed tab can recover an unexpired operation.
4. Retry only failed/conflicted items after a new preview; never replay completed groups. Notification draft, recipient preview and actual sending are separate approved actions. No workflow automatically publishes an animal or approves an adoption/payment.

## Incident isolation and rollback

- Schema fault or unexpected payment behavior: disable **new checkout** and affected new write endpoints via the reviewed policy/config, preserving prior webhook ingestion, reconciliation and durable provider events. Investigate the exact catalog, error/audit IDs and pending event queue before retry. Never mark a committed payment pending because receipt/email failed.
- Bulk issue: stop the specific UI/API operation, keep operation/result/audit rows, let in-flight per-item transactions settle, inspect succeeded versus failed IDs and perform a new snapshot for unresolved items. Do not blindly replay all IDs.
- Media worker issue: pause new claims, retain leases/checkpoints and committed-public invariant, inspect stuck/permanent failure counts, then resume with fencing intact. Do not expose uncommitted media.
- App rollback: no old app SHA is certified against the complete additive schema. Prove compatibility in a private candidate, leave additive schema/data in place, and roll app/config only. Do not restore an older DB over newer payment/audit/events.
- Production DDL/publishing/payment enablement/main merge require separate approvals; no such approval is recorded here.

## Outstanding inputs for release owners

- Current production catalog snapshot, grants/RLS/storage policies and sanitized data-bearing clone plus backup/restore rehearsal for 43 manifest files.
- Approved payment policy/methods/instructions, provider sandbox credentials/account and webhook replay evidence; approved sponsorship terms PDF/hash, cancellation/refund copy.
- Approved animal/story/photo ID list and rights, volunteer policy/session coverage, real content/seed diff, private candidate URL and test identities for every admin role.
- Email test sink and hosted Auth OTP settings; monitoring/alert thresholds, five-minute worker/cron ownership, private regional benchmark, 390/768/1366 keyboard/200% UAT.
- Remaining T23 domain implementations: sponsorship, finance, CMS and additional volunteer/adoption/animal/CRM safe actions. `tracker.csv` keeps ADMIN-04 partial.
