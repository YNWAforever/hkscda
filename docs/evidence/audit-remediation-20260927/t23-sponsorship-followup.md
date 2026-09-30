# T23 sponsorship follow-up assignment · PR #169

Source: `05bb6f1b64fbf39c8f40944b27f446a38751e809`, stacked on draft #168. Problem `ADMIN-04` stays **partial**: this slice adds a single pledge follow-up assignment, while bulk selection, reminder drafts and other domain actions remain open. No payment/proof state, notification or provider command changed.

## Reproduction and correction

The handler and RPC were absent on the parent branch. New module and local-DB tests failed for missing implementations. An initial SQL version then returned `40001` for an exact retry; a regression test captured it before the one-version replay rule was added. The pledge now carries nullable assignee and a bigint version that increments on every update, so payment/status changes invalidate an old assignment. The command locks current actor and assignee Admin/Auth rows, checks active staff/admin role, confirmed identity and ban, then locks the pledge, checks `needs_followup` and version, and updates assignment plus audit in the same transaction. Only the exact completed retry replays without another audit.

Staff/admin read a no-store list of active assignment candidates and use a labelled bilingual picker in the existing pledge drawer. The API accepts only bounded JSON and an expected version. Existing RLS has no authenticated UPDATE policy on the pledge; the new RPC is service-role-only. Old schema returns no version, so the new picker fails closed until migration. Existing webhook, reconciliation, proof review, receipt and finance paths remain available.

## Executed verification

| Command / environment | Exit | Result |
|---|---:|---|
| `SPONSORSHIP_FOLLOWUP_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres SPONSORSHIP_FOLLOWUP_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/sponsorshipAdmin/followupAssignment.database.test.ts` | 0 | 3 pass, 20 assertions: catalog/RLS/grants/index, direct authenticated UPDATE denied, role withdrawal, Auth ban, unconfirmed actor, version conflict, exact retry, forced audit rollback, two-connection single-winner race and one audit. |
| `bun test src/lib/sponsorshipAdmin/followupAssignment.server.test.ts src/lib/sponsorshipAdmin/followupAssignment.database.test.ts src/lib/operations/releaseManifest.test.ts` with same DB env | 0 | 9 pass, 76 assertions before later DB-only additions. |
| `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` at source commit | 0 | 2910 pass, 109 skip, 0 fail, 9057 assertions, 523 files. First run concurrent with lint/typecheck had one 5-second legacy RLS hook timeout; that file passed 39/39 alone, and sequential full run passed. |
| `npm.cmd run typecheck` | 0 | Strict TypeScript; separate from build. |
| `npm.cmd run lint -- --quiet` | 0 | Final LF-normalized source. |
| `npm.cmd run build` | 0 | Generated the two new routes; no client import of the server-only module. |
| `CHECK_RELEASE_SCHEMA_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres bun scripts/check-release-schema.ts` | 0 | 119 compatible requirements, zero issues; local ledger still `20260927150000`. |

The exact final `20260928073000_sponsorship_followup_assignment.sql` blob (`c14423a65c843c99fe0b76b3c12ec2de7bb6891188f701eac9d86a1fe1a551ef`) ran inside `BEGIN/ROLLBACK` after removing only its previously applied local objects within that same transaction. Function and trigger existed in the transaction and still existed after rollback. The prior version was applied solely to the unlinked local DB and the final function replaced there for synthetic tests; no migration ledger row was fabricated. The committed local two-connection fixture was deleted; a follow-up count found zero synthetic concurrency supporters.

## Acceptance and release boundary

Before UI: the `needs_followup` pledge drawer showed no owner control. After source: it has a current-owner line and keyboard-labelled staff picker with stale-version refresh. Actual before/after browser screenshots and mobile/keyboard staff-session UAT: **not-run**, because no hosted test staff identities were supplied. Same-environment performance comparison for this slice: **not-run**. Remote source CI run `36360874161` passed verify, RLS matrix, brand, a11y and performance at `05bb6f1`.

Schema is additive, but the new API must follow the migration. Rehearse all **47 ordered files** on a fresh disposable installation and sanitized data-bearing clone; compare exact current catalog, grants, RLS, trigger, index and signatures, measure locks and backup/restore, then obtain specific release approval. On app rollback disable the assignment endpoint/UI first; retain the assignee/version/audit facts until a compatibility-proven rollback is available. Never restore an older database over later payment or audit events. No production DDL, deployment, notification, payment, refund or public preview occurred.
