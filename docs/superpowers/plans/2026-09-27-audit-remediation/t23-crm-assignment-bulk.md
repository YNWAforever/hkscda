# T23 CRM bulk assignment · implementation slice

Scope: assign existing supporter records to an active treasurer or admin for CRM follow-up. The existing selected-supporter list drives a bounded, recoverable bulk operation. Tag bulk, restricted export and contact-format preview remain separate actions.

## Data and command contract

- Add nullable `supporter.crm_assignee_user_id` referencing Auth users. The #177 `edit_version` trigger increments on assignment and any other supporter edit. No identity, consent, gift, receipt or message field changes.
- Only a current, confirmed, non-banned treasurer/admin can create, read or apply an operation. The assignee must meet the same rule at preview and again at apply. The database locks the actor and assignee Auth/admin rows while applying, so a concurrent downgrade cannot silently commit an assignment.
- Preview accepts 1–1,000 distinct UUIDs and a 64-character filter hash, stores an actor-owned 15-minute snapshot, and returns ordered before/after assignees. Missing/deleted/already-assigned rows are skipped. Apply handles at most 25 pending items per request, rechecks the supporter edit version and prior assignee under row lock, then writes assignment, per-item result and audit in one transaction. A repeated apply returns the recorded result. A changed supporter becomes conflict.
- API methods and request bodies are bounded; errors and results are no-store. The staff panel uses the existing selection, a current assignee list and shared BulkReview result UI, with session recovery. It never sends notices or merges identities.

## Acceptance and release

- Reproduce missing RPC and route with failing tests before SQL and code. Test 25/1,000 limits, actor/assignee revocation, stale version, expiry, duplicate apply, partial results and audit failure rollback on a named disposable DB. Test unauthorized direct API before any read/write. Run strict typecheck, full isolated suite, lint, build, fresh/upgrade migration rehearsals, catalog/grants/RLS and CI.
- This is an independent draft PR stacked after #177. Production remains NO-GO until the live 79-version ledger bridge, sanitized data-bearing rehearsal, actual-role/mobile/keyboard UAT and release approval. Keep the additive assignee column and audit facts during app rollback; never reset production or replay an older database image.
