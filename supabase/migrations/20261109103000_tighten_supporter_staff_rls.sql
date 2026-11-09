-- AUD-02 (inherited from AUDIT.md R3; re-confirmed by the 2026-11-09 auth audit): supporter
-- CRM data and consents are not staff-readable in the database, matching the APIs.
--
-- `20260623160506_phase_2_donations_mvp.sql` created five policies keyed on
-- private.has_admin_role(array['staff', 'treasurer', 'admin']): "staff can read supporters",
-- "staff can update supporters", "staff can read supporter roles", "staff can read consents"
-- and "staff can update consents" (lines 280-305). Every CRM API that serves that data is
-- requireAdmin(request, ["treasurer", "admin"]) (src/routes/api/admin/supporters/**,
-- src/lib/crm/http.server.ts), and the role matrix gives `staff` no supporters area at all
-- (src/lib/admin/access.ts ROLE_ACCESS). A staff JWT could therefore ignore the API and read
-- or update supporter PII and consent rows over PostgREST. No later migration redefines these
-- policies (checked through 20261109102000), so only these five are still staff-wide.
--
-- Latest-definition-wins: each policy is dropped by name and recreated with the same name, so
-- the effective definition after this migration is the treasurer/admin pair below. Nothing
-- else changes: there is no insert policy on either table, no public/own-row supporter policy
-- exists for the supporter portal (its data is served by service-role repositories, e.g.
-- src/lib/supporters/portalRepository.server.ts, which bypass RLS), the `authenticated` table
-- grants stay as they are, and service_role keeps its grant. No rows are read or rewritten.
drop policy if exists "staff can read supporters" on public.supporter;
create policy "staff can read supporters"
  on public.supporter for select
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']));

drop policy if exists "staff can update supporters" on public.supporter;
create policy "staff can update supporters"
  on public.supporter for update
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']))
  with check (private.has_admin_role(array['treasurer', 'admin']));

drop policy if exists "staff can read supporter roles" on public.supporter_role;
create policy "staff can read supporter roles"
  on public.supporter_role for select
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']));

drop policy if exists "staff can read consents" on public.consent;
create policy "staff can read consents"
  on public.consent for select
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']));

drop policy if exists "staff can update consents" on public.consent;
create policy "staff can update consents"
  on public.consent for update
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']))
  with check (private.has_admin_role(array['treasurer', 'admin']));
