# T23 CRM bulk follow-up assignment · #178

Source commit `a3dc126024267015a17939d6c5cd3715bbcce1f0`, stacked after #177. Draft PR [#178](https://github.com/YNWAforever/hkscda/pull/178). Committed migration `20260928120000_crm_assignment_bulk.sql` SHA-256 `07799b13c740c998b31b9e864c921771eb66044c58f0644f50a6a696813a4e34`. This is code-complete and schema-ready on isolated stacks; no production deployment, migration, notification or operational enablement occurred.

## Contract and failure reproduction

The selected-supporter screen now offers an active treasurer/admin assignee picker and a separate CRM assignment panel. It stores a 1–1,000 ID, 15-minute preview; marks missing, deleted and already-assigned records as skipped; applies at most 25 pending rows per request; and rechecks current actor/assignee roles plus each supporter's `edit_version` and previous assignee. The assignment, item result and audit insert share one transaction. The panel can recover its operation ID from session storage. It does not alter identity, consent, payment, gifts, receipts or message state, and sends no notifications.

Before implementation, the schema catalog test failed because the assignee column and four RPCs were absent; the route and assignee picker tests failed on missing modules. The release-manifest test failed at 26 versus 28 required tables. The existing #177 `edit_version` trigger is a prerequisite.

| Command / environment | Exit | Result |
|---|---:|---|
| `bun test src/lib/crm/assignmentBulk.database.test.ts src/lib/crm/assignmentBulkBehavior.database.test.ts src/routes/api/admin/supporters/assignment-bulk.test.ts src/routes/api/admin/supporters/assignment-assignees.test.ts`, explicit synthetic 57322 opt-in | 0 | 6 pass / 38 assertions after implementation; invalid and duplicate selection, 1,001 cap, access denial, 25-item checkpoint/retry, disable, expiry and audit failure. |
| `bun test src/lib/crm/assignmentBulkConcurrency.database.test.ts`, named 57322 local DB | 0 | Two real connections: one assignment succeeded, the competing snapshot conflicted; one `supporter.assign_crm_followup` audit. Synthetic rows cleaned. |
| Original SQL and appended assignee-list RPC, each under `BEGIN`/`ROLLBACK` on named 57322 | 0 | Both pieces succeeded and rolled back. The final full file was applied via real migration-up on 64322 and 63322; the 57322 fixture received local SQL only, without fabricating a ledger row. |
| `bunx supabase migration up --local --yes` on unlinked 64322 fresh-installed and 63322 synthetic upgrade stacks | 0 each | Both real ledgers 161→162 through `20260928120000`; no manual ledger insert. The 63322 upgrade retained byte-equivalent JSON row hashes for two synthetic payments and one delivery job: `payment=2|2ac2d668924e2d1033c217ddb656ce3a`, `delivery=1|b1e1737b679e9b976b0bcc09935489fa`. |
| `bun scripts/check-release-schema.ts` with 64322 and 63322 URLs | 0 each | 140 requirements compatible, zero issues on both. This checks public table columns, RLS, service grants, RPC signatures and execute roles. |
| `bun test --isolate`, named API 57321 and DB 57322 with explicit synthetic bank/CRM flags | 0 | 2,970 pass / 112 skip / 0 fail / 9,405 assertions across 552 files. Skipped hosted/provider tests are not counted as pass. |
| `bun run typecheck`; `bun run lint -- --quiet`; `bun run build` | 0 each | Strict TypeScript, lint and build checked independently. Full lint without `--quiet` also exited 0 with 52 existing Fast Refresh warnings. |

Remote source CI `36394352630` passed verify, RLS, brand, a11y and performance; evidence-head CI pending.

Direct authenticated/anon EXECUTE on assignment RPCs and authenticated SELECT on operation tables are denied in the fixture. The assignee list excludes a disabled user; apply rejects a disabled actor or assignee. A name-only edit after preview conflicts. Audit-insert failure rolls back the assignment. Public tables have RLS enabled and service-role SELECT only. Fresh catalog inspection found the assignee FK and all three declared indexes; the private guard has `search_path=""` and anon/authenticated/service_role direct EXECUTE false. The real two-connection test proves one winner, one conflict and one assignment audit for competing snapshots.

The saved read-only production catalog snapshot, re-evaluated without a new production query, is incompatible against the 140-item manifest: 134 required missing entries (28 tables, 83 functions, 23 columns). The last observed live ledger has 79 versions and diverges from source; the local 161→162 rehearsals do not establish a safe migration path from that live state.

## UAT, performance and release boundary

The supporter list's rendered markup includes the new labelled controls, but authenticated 390/768/1366 captures, keyboard journey, actual-role direct API/export/private-file checks and same-environment before/after CRM performance measurement are **not-run** without a private candidate and test identities. The existing public/volunteer before/after captures and performance comparison are in `ui-performance.md`; no new numeric performance claim is made for #178. Provider sandbox, email sink and payment tests are unrelated to this assignment and remain gated by their own approvals/credentials.

Before production migration: reconcile the 79-version ledger, inspect current catalog/signatures/grants/RLS/indexes/storage, rehearse the complete bridge on a sanitized data-bearing clone, measure supporter ALTER/FK validation and index locks, prove backup/restore and certify an older-app rollback SHA. Keep the additive assignee column, version history and audit/payment facts on app rollback; disable the new assignment UI/API until a compatible deployment is approved. Main merge and release still require separate approval.
