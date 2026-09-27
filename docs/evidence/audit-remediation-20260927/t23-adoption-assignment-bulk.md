# T23 adoption assignment bulk slice

Draft PR #161, source commit `4f0c4c9`, stacked on #160.

Scope: admin-only assignment of an active staff/admin owner to selected adoption cases in one open stage and a minimum waiting age. No adoption approval, animal match, message sending or status change. This slice stacks after volunteer reviewer bulk #160; other T23 domains remain open.

## Reproduced failures and fix

- Missing `create_adoption_assignment_bulk_preview` was red before the dedicated local migration (signature null), then green.
- A stale case `updated_at` was red because transaction-time values can alias. The additive monotonic `bulk_row_version` trigger and per-item fence made it green.
- A stage switched to closing after preview was red. Per-item stage-definition revalidation made it green.
- UI selection is bounded to 25 visible or 1000 matching, records the filter and explicit minimum waiting days, clears on filter change, and recovers the 15-minute server snapshot after refresh. API caps payload, checks admin, applies 25 at a time and returns no-store results.

## Verification

- Dedicated local DB at 127.0.0.1:57322: `ADOPTION_ASSIGNMENT_BULK_TEST_DATABASE_URL=<dedicated loopback> ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/adoptions/assignmentBulk.database.test.ts`: exit 0, 3 pass, 18 assertions. Covers too-recent and closing stages, version conflict, closed case, retry, 1001 cap, actor/assignee revocation, expiry, forbidden grants, trigger and forced audit failure rollback. Synthetic fixtures rolled back.
- Focused CaseList/selection/API/manifest: 9 pass, 66 assertions, exit 0. Staff cannot see bulk controls; admin can. `CHECK_RELEASE_SCHEMA_DATABASE_URL=<dedicated loopback> bun scripts/check-release-schema.ts`: exit 0, 104 compatible requirements, zero issues.
- `npm.cmd run typecheck`: exit 0. `npm.cmd run lint`: exit 0, 52 existing warnings, 0 errors. `npm.cmd run build`: exit 0 on final source. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: exit 0, 2865 pass, 97 skip, 0 fail, 8883 assertions across 509 files. The fixture-dependent DB tests above were run separately. `git diff --check`: exit 0. Remote CI at source commit `4f0c4c9` and real-role browser UAT pending.

## Release boundary

Migration SHA-256 575ffb9b9b60f59c3c02d0866bf666d28365d0d8eaff98f792a19bc30801f682 completed a transaction rollback rehearsal and was applied only to the unlinked local DB without a ledger row. Draft PR only; production migration, public preview and main merge require separate release approval. Run data-bearing clone lock and trigger checks, hosted direct-API/role/RLS tests and mobile/keyboard UAT before promotion. Existing webhook and reconciliation remain available.
