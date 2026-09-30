# T15 / ADMIN-02 — version-safe supporter editing

Status: source `115d0c65c09af2c26cbcfd28a1c7a9d39ce47c30` is in draft [PR #149](https://github.com/YNWAforever/hkscda/pull/149), based on #134. Code complete and locally schema-ready; deployed **no**; operationally enabled **no**. ADMIN-03 list search remains separate and open.

## Reproduction and implementation

- Red tests first: edit service dropped expectedVersion; stale SQL conflict surfaced as HTTP 500. Both failures were observed before repair. A direct PATCH without expectedVersion also returned 200 in a service stub; the handler now rejects it with 400 before a write.
- On every edit-dialog open, GET the current supporter detail. A cancelled A draft is discarded only after the user chooses to discard; reopening reads the server again. Changing supporter ID while mounted does not expose the prior draft. A failed read disables saving.
- The save command includes positive, safe-integer expectedVersion. New public.mutate_crm_supporter_if_version_with_audit takes a supporter row lock, checks the current version and active treasurer/admin actor, then writes profile, roles and audit in one transaction. A stale token raises P4090 and maps to 409. The prior seven-argument create/update RPC remains for older app versions.
- New edit_version bigint starts at 1; profile and supporter-role triggers increment it on changes. The role trigger also advances updated_at via the existing table trigger. No existing role/RLS policy was relaxed.

## Local acceptance

- Exact migration file SHA-256 (committed LF bytes): d9756e0cb41dd7878e6046a0eab3db4b1f9dfb8a39751884d1cfd2b8df1fa80c. Applied only to unlinked local container supabase_db_hkscda-audit-remediation-20260927, database 127.0.0.1:57322. Replayed inside BEGIN/ROLLBACK with ON_ERROR_STOP=1; exit 0. No migration ledger was edited and no production database was reached.
- Catalog after the first apply: edit_version NOT NULL, 2 enabled triggers, SECURITY INVOKER with pinned empty search_path, service_role EXECUTE true, anon/authenticated false, supporter and supporter_role RLS true.
- With CRM_TEST_ALLOW_LOCAL_FIXTURES=1 and explicit CRM_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:57322/postgres, bun test --timeout=120000 src/lib/crm/supporterVersion.database.test.ts exited 0: 3 pass, 13 assertions. Two concurrent edits gave one winner and one P4090, one audit; a later role insert invalidated the earlier token; a failed audit insert rolled back the profile and version; staff/disabled actors were denied. Synthetic fixture rows were deleted by exact IDs.
- Standard isolated suite at SUPABASE_LOCAL_URL=http://127.0.0.1:57321: bun test --timeout=30000 --max-concurrency=8 exited 0 with 2,789 pass, 88 skip, 0 fail across 469 files, before the final direct-API and repository assertion additions. Their targeted reruns exited 0: 20 HTTP/schema tests, 11 repository tests. Focused CRM/component set exited 0: 42 pass before those additions. Strict typecheck and repository lint exited 0; lint retained 52 existing warnings. Edited CRM files produced no ESLint warning. Final post-correction bun run build exited 0 (46.78 seconds).
- Synthetic Playwright at 390×844: node scripts/verify-supporter-edit.mjs exited 0. It checked fresh GET on reopen, Escape and Cancel dirty guard, stale 409 retaining local text, explicit reload, supporter switch isolation, successful versioned PATCH and no horizontal overflow. The screenshot [ready state](ui/t15-supporter-edit-ready.png) uses mocked API and synthetic identities; it is not a live role login.
- Same-environment before/after performance was not measured for this dialog slice. Full PR CI and real-role UAT are reported separately.

## Release order and rollback

1. Review the catalog and migration checksum against the target. Confirm public.supporter, public.supporter_role, public.admin_user and public.audit_log signatures/grants/RLS, existing set_updated_at trigger and absence of conflicting edit_version definitions. Rehearse on a sanitized data-bearing clone, including lock timing, triggers, old app behavior and concurrent role changes. Obtain backup/restore owner approval.
2. With release approval, apply the additive migration before #149 application code. Confirm column, triggers, function signature, service_role-only EXECUTE and RLS after apply. Run isolated synthetic actor tests. Only then deploy the reviewed same-SHA app and run staff/treasurer/admin/disabled direct API and UI UAT.
3. Reverting app code to the previous SHA leaves the schema compatible, but older edits use the original unguarded RPC and lose conflict protection. Do not drop the column, triggers or new RPC while the new app or pending edit sessions may call them. If trigger behavior requires rollback, stop edit intake and use a separately approved migration after auditing dependent data. No production migration, main merge, public preview or live supporter edit was performed here.
