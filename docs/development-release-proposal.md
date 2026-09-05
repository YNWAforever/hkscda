# Development release candidate and rollback proposal

Status: **concrete local candidate; production release NO-GO pending external gates**. Updated 2026-09-06. No deployment, production migration, provider activation or cutover was performed.

## Candidate identity

- Repository: YNWAforever/hkscda.
- Audited and fetched baseline: `20c168459a90c5c92093659a18b139a994451470`.
- Isolated branch: `codex/completion-20260905`, under `.worktrees/completion-20260905`.
- Reviewed implementation includes CRM `1d0e6ff`, CMS `413d964`, public recovery/performance `3729a38`, real DB acceptance `6dd266c`, local reconciliation `77cd14f`, admin hydration `f0fea42`, and operational acceptance `1b9265f`. Earlier containment and measurement commits remain in branch history.
- Exact code candidate: `1b9265fd6d570c72af3eb8c670e96d58c1007cd2`. Final evidence-only commits do not change application code. Required remote CI run and deployment ID/URL are unassigned; nothing was pushed or deployed.
- Required acceptance evidence: `development-completion-evidence.md` and linked package records. Plans are not implementation or acceptance evidence.

## Ordered migration proposal (applied only to disposable local stack)

All seven migrations applied successfully to the unique disposable `hkscda-completion-20260905` stack (DB55322/API55321). Any later target requires the repository migration tooling and exact versioned files. Do not select a production connection by inference or run `db push` against a linked project during development.

1. `20260905144848_public_supporter_identity_claims.sql`: normalized identity resolution, contact snapshots, pending opt-in evidence and volunteer acknowledgement claims. Count-only duplicate preflight may fail closed; historical cleanup is a separate owner decision.
2. `20260905150012_content_revision_lifecycle.sql`: versions, immutable snapshots, atomic audit/lifecycle and filtered published backfill. Verify active backfill actor attribution and preserved published dates; compare counts and sampled public projections. New public reader requires this schema.
3. `20260905155357_crm_manual_gift_delivery_jobs.sql`: request ledger and transactional gift/payment/consent/role/audit/job, leased delivery recovery.
4. `20260905155426_content_private_media_sessions.sql`: private draft/internal bucket, server-owned sessions, idempotent finalize, staged approved public copies and publication pointer guards.
5. `20260905162615_crm_complete_read_models.sql`: complete CRM filtering/aggregate/export projections with a 5000-row output ceiling and explicit overflow.

6. `20260905163559_content_bounded_authoring_reads.sql`: bounded CMS summary projection, pre-pagination profile filters, independently paged history categories and explicit body expansion.
7. `20260905163900_volunteer_atomic_approval.sql`: staff approvals and capacity edits share public-submission locks, expected timestamps and transactional audits; complete capacity counts.

The candidate application requires all seven migrations in this order. Never rewrite migration identifiers after any target has applied them.

## Release sequencing to approve later

1. Review the frozen candidate SHA. Local final results:1981pass46skip0fail; the40opt-in cases behind skips (plus6hooks) executed separately, as did actual RLS/Storage/browser acceptance. Typecheck/lint/build/route parity pass. Record required CI contexts and exact remote results before any release. Current read-only branch protection returns `verify` and `brand-verify`; no settings were changed.
2. Completed locally: actual CRM17, identity4, RLS38, CMS19 and reconciliation1test; authenticated CRM7/CMS11browser checks; duplicate requests, rollback, stale versions, private URL denial, expiry and replay. Revalidate environment-dependent behavior on the identified release/staging target where it differs; these results do not establish production parity.
3. Execute synthetic owner/staff journeys using the existing `owner-uat-checklist.md`, plus the master plan's complete CRM/CMS recovery cases. Record each owner pass/fail/skip. Existing checklist's deferred landmark notes must be rechecked against the new candidate rather than treated as accepted findings.
4. Verify correct production project identity and read-only migration/grant/bucket parity. Inventory only counts/opaque references for historical public internal assets, duplicate messages and demo content. No automatic copy/delete/cleanup follows from inventory.
5. The synthetic local restore passed relationship, password sign-in, object-byte/privacy checks,52migration versions and74table-count comparisons; selected restore verification5720.94ms. Production still needs a verified backup from the correct project, schema/Storage/Auth coverage, approved recovery target and owner-agreed RPO/RTO. Existing data-only backup requires separate object/config coverage; local command success is not production recoverability.
6. Obtain explicit approval covering the exact candidate, production target, migration/backfill order, deployment window, rollback operator, object remediation (if any), payment method configuration and provider test/activation boundaries. No implicit payment activation or real-message test.
7. During the approved window prevent old/new incompatible CMS writes while schema and application switch. Verify the deployed SHA and new read/write contracts before reopening authoring; preserve existing published snapshots throughout failed asset preparation. Smoke test public and authorized admin paths and inspect durable delivery recovery.

## Rollback proposal

- Before any production action: abandon or revise this local branch without affecting original main; no production DB/object rollback is needed; local fixture mutations were confined to the disposable stack.
- Before application cutover but after additive schema changes: keep the approved old application only with affected authoring writes paused. Retain added tables and snapshots; do not run destructive down-migrations. Confirm any new guards' compatibility with the old application before resuming writes.
- After new lifecycle/manual-gift writes: **do not blindly redeploy audited main**. It reads mutable CMS rows and lacks the new identity/outbox protections. Prefer the last verified compatible candidate or a forward repair while affected writes remain paused. Public reads must retain the saved publication-pointer contract; delivery jobs and idempotency ledgers must be preserved.
- If data recovery is required, restore into a separate authorized target first, reconcile all writes since the recovery point, and obtain explicit authority before switching production. Never drop request ledgers or replay financial commands to rebuild state without reconciliation.
- Private source objects and finalized sessions remain intact during failed publication. Public copies created during preparation may exist even if pointer commit fails; inventory them with the dry-run reconciler. Keep the prior published pointer and objects serving. Cache purges, historical public-object removal and source deletion require a separately approved remediation list.
- Rollback triggers: failed migration/backfill comparison, unauthorized private URL access, duplicate financial/audit writes, stale-write overwrite, incompatible public snapshots, sustained delivery recovery failure, or owner-blocking journey regression. Preserve sanitized evidence and job/request IDs, never capability tokens or donor payloads.

## Local acceptance limits and external gates

The1k/10k/50k authenticated API benchmark completed465observations;14/15proposed latency targets met. One1kCMSlist p95=761.0ms missed750ms, while10k198.2ms/50k657.0ms met it. This retained local development-server observation is not silently waived or a production benchmark.

The final build used loopback54330 and CI placeholder credentials, with checkout enabled only for synthetic acceptance. It is not a production deployment configuration. A production build must use the approved target/configuration and retain the existing payment/provider release safeguards. Public default-off RUM remains unactivated.

Open: exact candidate remote CI, correct production DB/grant/bucket parity, historical internal-public asset inventory/remediation authorization, approved provider sandbox/end-to-end settlement and delivery, provider-dependent public-to-staff journeys, production backup coverage and owner RPO/RTO, field p75 metrics, owner UAT and cutover approval. Every owner sign-off remains NOT RUN in `development-owner-uat-status.md`.

Offline media inventory remains count-only. The additional apply command is technically confined to the disposable local553xx stack, with fresh locked references,24hgrace,10srequests and100candidate cap. It does not authorize or implement production asset remediation.

No production approval is requested with these gates unresolved. No main merge/push, deployment, production SQL/data/object change, provider activation or message to real people was performed. Local stacks may be stopped with their data retained after verification; restart instructions and raw evidence remain with this checkout.