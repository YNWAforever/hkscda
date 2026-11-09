-- AUTH-01 (audit 2026-11-09): the audit trail is not a browser-readable table.
--
-- `staff can read audit log` (20260623160506:351-354) let any active staff member read every
-- audit row over PostgREST with their own JWT, because `private.has_admin_role` returns true for
-- any active staff. The rows include admin-only access-management events (invited emails, role
-- and status transitions) and treasurer/admin finance events, while the APIs that own that data
-- are narrower than the policy (the access API is admin-only). Nothing in the admin browser reads
-- the table directly: audit history reaches the UI through service-role API handlers
-- (accessManagement.repository.server.ts, donations/supabase.server.ts `listFinanceActivity`,
-- crm/repository.server.ts, adoptions/repository.server.ts), and `adminBrowserDataGuard.test.ts`
-- keeps it that way.
--
-- Revoking the table privilege (not just dropping the policy) makes a direct PostgREST select
-- fail with "permission denied" instead of returning an empty 200, so the regression is visible
-- to the caller and to any future code that reintroduces a user-JWT read. `service_role` keeps
-- its select grant and bypasses RLS, so every API read path is unchanged. No rows are touched.
revoke select on public.audit_log from anon, authenticated;
drop policy if exists "staff can read audit log" on public.audit_log;
