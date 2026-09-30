# T14 / ADMIN-01 — private background CRM exports

Status: source `eeeb14419ae25808e946024761ffd4382e646084` and isolated-schema rehearsal complete; draft PR [#148](https://github.com/YNWAforever/hkscda/pull/148); deployed **no**; operationally enabled **no**. This branch builds on immediate-export UI draft PR #147. Staff role UAT and release gates remain open.

## Scope and behavior

- Immediate CSV still rejects 5,001 matches with HTTP 413 and no truncated file. The UI offers a background job with the exact failed filter snapshot. A job is bound to its active treasurer/admin actor and limited to 20,000 frozen record IDs. The private job row keeps the filter snapshot; audit details record only kind and count, not free-text filters.
- The worker reads and atomically appends one 500-row page per authorized cron invocation. Progress is stored in the job row and shown in the admin UI; a refresh resumes using only the job ID from session storage. A lease expiry can retry a page without duplicate rows or a second CSV header. An incomplete page fails closed.
- CSV formula escaping and UTF-8 use the existing shared builder. The artifact lives in a private Postgres table, is downloadable only after completion, and requires live actor/role checks each time. Cancel deletes the artifact and fences a late worker. Expiry blocks reads at 24 hours; cron deletes expired jobs and artifacts.
- The new 5-minute cron entry uses the existing CRON_SECRET guard. It has not been deployed or invoked against production. This change does not touch payment webhooks, reconciliation, refunds, content publication or production PII.

## Reproduction and acceptance evidence

- Red: isolated loopback CRM database test exited 1 because enqueue_crm_export_job was missing (Postgres 42883).
- Final migration 20260927090000_crm_private_export_jobs.sql SHA-256 ab41e08ff5b4c162a90b76baf238b77bae92caabf2fbf865fd953e126d9bc549 was replayed as **one transaction** in the named unlinked local Supabase container after both synthetic export tables were verified empty. No migration ledger row was fabricated; no production database was accessed.
- Post-replay SQL test: 3 pass, 0 fail, 145 assertions. 5,001 synthetic supporters and 5,001 donations paged to 5,001 unique IDs each, with no truncation. It verified actor denial, revoked-role download denial, forbidden EXECUTE grants, RLS, expiry and deletion, failure audit, exhausted retry state, two-connection claim exclusivity and cancellation fencing. All fixture rows were rolled back or removed by exact synthetic ID. A separate red/green regression first proved a free-text filter leaked into audit detail, then passed after removing that value.
- Focused worker tests: 3 pass, 0 fail. Direct API tests: 2 pass, 0 fail. Mobile 390×844 synthetic browser command node scripts/verify-background-export.mjs exited 0 for create, reload resume, progress, complete download, cancel and a revoked-role 403, using mocked API and fake token. [Ready state](ui/t14-background-export-ready.png) follows the [413 state](ui/t14-export-413-after.png) from #147 in the same fixture. Browser evidence is not a production role login.
- A one-shot worker was rejected after a cold local 5,001-row test took 61.4 seconds for both export kinds. The revised worker commits one bounded page per run. A later warm local 5,001-row SQL run took 3.1 seconds, while a run contending with the app build took 83.4 seconds; these are not controlled before/after measurements. No production latency claim is made.
- Full suite, standard isolated configuration: SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8, exit 0; 2,799 pass, 86 skip, 0 fail across 472 files. The CRM SQL suite was run separately with explicit loopback 57322 because another repository test deliberately accepts only 55322/56322 when CRM_TEST_ALLOW_LOCAL_FIXTURES=1; a combined run exited 1 from that environment guard, not from T14 code.
- Strict bun run typecheck exited 0. Repository bun run lint exited 0 with 52 existing warnings; edited-file ESLint exited 0 with no warning. Focused export tests exited 0: 21 pass, 0 fail. Final bun run build exited 0. Remote CI is reported separately; do not infer it from local gates.
- Final catalog query: 9/9 public export RPCs are SECURITY DEFINER with public,pg_temp search_path, service-role EXECUTE, and no anon/authenticated EXECUTE; both tables have RLS enabled and zero policies.

## Migration preflight and deployment order

1. Require release approval before any main merge or production DDL. Confirm target project, backup and rollback owner. Verify exact catalog dependencies: auth.users; public.admin_user role/status/auth_user_id; public.supporter; public.donation; public.audit_log; private.crm_matching_supporters(jsonb); private.crm_supporter_summary(uuid). Confirm there is no conflicting export job/artifact definition. Review checksum in the manifest.
2. Rehearse on a sanitized data-bearing clone, including locks, grants, RLS, constraints, function signatures and storage capacity. Current proof is a disposable local schema and synthetic data only.
3. Apply this additive migration before an approved #148 app release. Check exact pg_proc signatures, SECURITY DEFINER, pinned search_path, service-role EXECUTE and anon/authenticated denial; check pg_class RLS and table grants. Run the SQL regression with synthetic roles.
4. Confirm the Vercel team's cron frequency entitlement before merging the 5-minute schedule. [Vercel documents](https://vercel.com/docs/cron-jobs/usage-and-pricing) daily-only Hobby cron versus per-minute Pro/Enterprise cron; actual project entitlement was not confirmed here. Validate CRON_SECRET without printing it, then run a synthetic job and observe claim/page/ready/cleanup. Existing hourly crons are separate.
5. Release #147 before #148. Then run real test-identity UAT for treasurer/admin, staff, disabled account, direct URL/API, download after role revocation, cancellation, reload and mobile keyboard. Do not use production supporter data as a test fixture.

## Compatibility and rollback

- Old application code ignores the additive schema. New background creation requires these RPCs; deploying #148 first would return a safe error for this path. Immediate exports stay capped at 5,000.
- If the app must revert after job creation, stop new intake but retain cleanup or arrange approved manual cleanup. Do not drop tables while jobs/artifacts remain. A previous app SHA without this cron cannot physically delete expired artifacts, although SQL download still refuses them. Verify zero jobs/artifacts before later schema removal.
- This slice must not interrupt existing payment webhooks or reconciliation. No production migration, main merge, public preview, live export, email or payment action occurred.
