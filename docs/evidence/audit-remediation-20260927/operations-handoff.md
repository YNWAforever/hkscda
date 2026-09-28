# T24 · staff operations and rollback handoff

**Current state: review only.** All remediation PRs remain drafts. Production alias still points to original main at last verification. Staff must continue the currently approved production procedures; none of the new bulk, checkout, portal or content functions has been enabled by this package.

## Staff roles and day-one checks after an approved release

| Owner | Required action / evidence |
|---|---|
| Release owner + DBA | Confirm exact app SHA, migration manifest checksum, production backup/restore test, ordered catalog/signature/grants/RLS/seed gate, compatible rollback target and CI at same SHA. Approve private candidate, migration and main merge separately. |
| Sponsorship reviewer | Open the pending-proof task card to reach `?proof=pending`; inspect the current proof ID/revision in the drawer. An active pledge may have a new month awaiting review. Upload alone never confirms payment; approval uses the existing finance command. For `needs_followup` pledges, choose an active staff/admin follow-up owner in the drawer and confirm the assignment. A 409/stale result means another update won: refresh before choosing again. No notice is sent by this assignment. |
| Finance treasurer | Approve each payment method, public instructions/config version and account details; inspect sandbox callbacks, pending/uncertain reconciliation, receipt delivery and refund controls. Payment success remains committed even if PDF/email fails. For manual reconciliation, inspect the durable delivery job, retry only that job, and never credit the bank reference again. Never bulk-refund or void without per-item review. |
| Content owner | Use the read-only CMS demo/expired/missing-source queues to inspect exact live IDs and source classification; filtered queues do not bulk publish or bulk review. Review photo rights, animal mapping, terms/copy diffs and public impact before any publication/archive. #133 fallback is only for CMS revision read `PGRST205`/`42P01`; permission, unexpected, missing published revision and invalid content stay errors. |
| Volunteer coordinator | Approve policy and 14/30-day activity coverage; review each bulk preview's scope, exceptions and capacity. Confirm notices separately. |
| Admin lead | Exercise each actual role's direct API, export, private media/receipt and revoked-session behavior in private candidate. Train staff on 25 visible / up to 1000 matching selection, expiring snapshots, per-item result CSV, conflict refresh and failed-only retry. Do not assume a bulk job is one atomic multirow command. |
| On-call | Before an approved candidate release, run `READINESS_BASE_URL` + private `READINESS_TOKEN` + `READINESS_EXPECT_SHA` with `bun scripts/verify-live-readiness.ts`; require ready and rendered adoption content. The private endpoint uses `CRON_SECRET`, returns no-store and 503 when unavailable; missing CMS relation is degraded and blocks this strict release gate even while #133 seed copy keeps the page readable. When a visitor reports the adoption-page reference ID, locate the matching code-only loader log; do not request or paste their form payload, address or token. Record worker last success/backlog, webhook replay, pending payments, receipt failures, error rate and public-content smoke before/after release. Keep old provider event intake and reconciliation available while new checkout admission is disabled. |

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

- Live 79-version ledger reconciliation (51 source-only and 21 live-only historical versions), complete production catalog/signatures/grants/RLS/storage policies and a sanitized data-bearing bridge rehearsal plus backup/restore. The 51 post-version source files alone are not a production migration path.
- Approved payment policy/methods/instructions, provider sandbox credentials/account and webhook replay evidence; approved sponsorship terms PDF/hash, cancellation/refund copy.
- Approved animal/story/photo ID list and rights, volunteer policy/session coverage, real content/seed diff, private candidate URL and test identities for every admin role.
- Email test sink and hosted Auth OTP settings; monitoring/alert thresholds, five-minute worker/cron ownership, private regional benchmark, 390/768/1366 keyboard/200% UAT.
- Remaining T23 domain implementations: approved reminder sending, bank-specific import adapter and sanitized sample, other safe domain actions. Read-only canonical bank dry-run/candidate preview is draft #172; guarded failed-delivery worklist and single-job retry are draft #173; role task guidance is draft #174; guarded exact bank confirmation is draft #175; read-only CRM format preview is draft #176. The manual finance atomic prerequisite is draft #165. `tracker.csv` keeps ADMIN-04 partial.

## Sponsorship follow-up staff steps after approved schema and app deployment

1. Open the sponsorship pledge queue filtered to `needs_followup`; inspect the pledge and proof history. A submitted proof or owner assignment does not confirm money.
2. In the pledge drawer, choose the current active staff/admin owner and use **Assign follow-up**. The response updates only owner/version and records an audit fact. If the owner list is unavailable or the pledge version is missing, stop and ask the release owner to check schema/readiness; do not use a direct table edit.
3. If the request reports a conflict, refresh and recheck status, payment and owner before retrying. Exact retries return the committed assignment without a second audit. Do not send a reminder from this control; use the separate read-only draft panel for recipient preview. Any actual send requires approved wording, current-fact revalidation and separate authorization.
## Sponsorship bulk staff steps after approved release

1. In the pledge queue, filter `needs_followup`; choose eligible rows on this page or all matching (maximum 1,000). Review the count and chosen staff member. Changing filters clears the selection.
2. Create preview and inspect before/after owners plus skipped/conflict reasons. Confirm the selection; apply 25 at a time. The tab can recover the operation ID, and the per-item CSV is available from the result panel.
3. If interrupted, refresh the saved operation and resume pending items only. For a conflict or expired preview, inspect current pledge/payment/proof facts and create a new snapshot for unresolved IDs. Never mark proof upload as payment, send reminders from this control or replay succeeded items.

## Sponsorship reminder draft staff steps after approved app release

1. Open the pledge drawer as staff/admin and choose **核對並產生草稿**. The server rereads current pledge, proof and month-allocation facts. Treasurer readers cannot access the direct draft API.
2. Review the recipient, oldest eligible past month, internal outstanding commitment and generated time. An uploaded pending proof or refund adjustment blocks the draft; send these to proof/finance review first. The current month has no due-day in the schema and is not treated as overdue.
3. Treat the subject/body as unapproved internal wording. Regenerate after any fact change. This panel cannot send, queue or mark a reminder as sent; a future send workflow needs approved copy, recipient preview, current-fact revalidation and explicit authorization.

## Finance and task-guide staff steps after approved release

1. In the role-gated task overview, use the numbered guidance as a route to the relevant workspace. Its count can be zero, positive or **未能讀取**; unavailable does not mean no work. The guide never approves, pays or sends anything.
2. For an offline bank export, an approved bank-specific adapter must convert it to the canonical CSV columns `bank_reference,received_on,currency,amount_hkd,payment_hint`. Open finance as current treasurer/admin, choose the file and generate the **read-only** #172 preview. Check file hash, invalid rows, duplicate/credited references, candidate amount/hint and freshness. The preview cannot reserve or settle; refresh after payment facts change. #175 permits only a separate persisted exact-match snapshot and one-at-a-time staff confirmation after approval and deployment.
3. In #173's failed-delivery list, inspect the existing successful payment/donation and recipient facts before each confirmed single-job retry. A retry requeues the same durable job with audit; it does not re-credit the payment. A 403 after role/ban change stops the action; a false/stale result requires refresh. Do not bulk retry, refund or void. Receipt/email delivery failure must never change a successful payment back to pending.
4. Staff should escalate a missing private list, unavailable metric, schema-signature mismatch or unexpected duplicate reference to the release owner. Keep old webhook and reconciliation intake active even if **new** checkout is disabled. Only an approved operator may run production migrations, enable payment methods or send notifications.

## T23 bank match staff steps after approved schema and app release

1. Obtain an approved bank-specific adapter and sanitized sample. Convert the offline export to the canonical CSV; never upload the original bank file if its columns or meaning differ. Review the read-only preview, file hash, invalid/duplicate/credited references and exact candidate evidence.
2. Select only one-to-one exact rows and create a 15-minute operation. Reopen the operation by its saved ID after refresh. Verify each displayed bank reference, exact payment hint, payment ID and HKD amount; confirm a single pending row at a time. The native confirmation applies only that row. There is no unattended apply-all.
3. Inspect each succeeded, skipped or conflict result and download the per-item CSV. A changed version, reused reference, expiry or role change requires a new preview for unresolved rows. Do not replay succeeded rows, substitute a different reference, refund, or infer that a queued receipt/email has been sent. Failed delivery is handled separately by the guarded #173 worklist.
4. Escalate adapter ambiguity, unavailable schema, unexpected duplicate references or missing durable delivery jobs. Keep old webhook/reconciliation active; only release owners can authorize production migration, payment enablement or notification sending.

## T23 CRM format preview staff steps after approved app release

1. As an active treasurer/admin, filter supporters and select this page or all matching results up to 1,000. Open the contact-format preview. Changing the filter or selection clears the old result; create a new preview instead of trusting an old screen.
2. Review suggested whitespace changes and each manual identity-review case. A changed email is an identity decision, not a formatting command. The panel has no apply action and cannot merge supporters, grant consent or send a message.
3. Missing/deleted rows are redacted. Reopen the current supporter record if needed; use the existing restricted export workflow for any approved export. Escalate unexpected PII, unavailable preview or authorization mismatch to the release owner. Hosted actual-role API and keyboard/mobile UAT are still required before enabling this branch.
