# T23 finance bank match confirmation · implementation slice

Status: implementation in isolated draft branch. Parent PRs #165 (atomic manual settlement), #172 (canonical read-only CSV candidate preview) and #173 (delivery recovery) are prerequisites. The observed production ledger remains `20260914164558`; this slice adds one ordered migration after `20260928100000`. No production payment, mail, migration or provider action is authorized by this spec.

## Scope and invariant

A current treasurer/admin may upload a canonical HKD CSV, choose rows with **exactly one matching payment hint** from the read-only preview, inspect a durable 15-minute snapshot, and explicitly confirm one row/group at a time. Amount-only, ambiguous, duplicate-file, previously credited, invalid and unmatched rows cannot enter a settlement snapshot. A payment or normalized bank reference may appear only once per operation. The original CSV text is never persisted; store its SHA-256 and selected normalized row facts. A bank-specific adapter/sanitized sample is still required for real-bank UAT.

Each apply locks the operation, item, payment and donation; rechecks current active/confirmed/unbanned finance actor, expiry, expected payment/donation versions, pending HKD/manual-method facts, amount equality and reference uniqueness. It invokes the existing `reconcile_manual_payment_atomic` inside that transaction, so payment/donation, bank-reference reservation, durable delivery job, financial audit and per-item result commit together. A stale or duplicate item records conflict; a transient server failure leaves pending for explicit retry. An already succeeded item returns its result without reapplying. No immediate PDF/email worker call, refund or void path is added. Existing provider webhooks/reconciliation remain active.

## Implementation order

1. Red rollback-only DB tests: missing snapshot/apply functions; banned/role-downgraded actor, stale payment, duplicate reference, expiry, double apply and audit/recipient-job preservation.
2. Add additive RLS-enabled operation/item tables and service-only read/create/apply RPCs with empty search path and explicit grants. Add new signatures to release schema manifest. Rehearse exact SQL in isolated DB, check catalog/grants/RLS and a fresh install plus synthetic baseline-to-current upgrade.
3. Red service/API/UI tests for only exact unique candidate selection, bounded CSV/body/row count, no-store finance role, actor forwarding, confirm-one-row and resumable results. Implement thin route/service and reuse existing canonical parser/preview.
4. Run focused, full isolated, independent typecheck, lint, build, CI five gates and role/RLS checks. Update 34-issue tracker, migration manifest/checksums, staff runbook, UAT and release NO-GO package. Draft PR stacked on #174.

## Acceptance and limits

Snapshot → preview → per-item permission/version check → apply → result is required. Test 25 and 1,000 selection, same reference/payment duplication, role revocation, expired preview, concurrent applies, partial failure and retry. Do not claim a production-like rehearsal from sparse synthetic data. Hosted finance role/private API/phone/keyboard, actual bank adapter, provider sandbox, sanitized data-bearing clone, backup/restore, current production catalog and release approval remain not-run until provided. On app rollback disable the new confirmation UI/API; retain committed bank credit, job and audit facts and do not restore an old database over later transactions.
