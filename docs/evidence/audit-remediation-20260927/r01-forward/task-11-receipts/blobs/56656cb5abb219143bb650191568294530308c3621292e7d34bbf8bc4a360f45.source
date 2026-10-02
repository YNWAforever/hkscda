-- Harden public-facing role grants and remove a stale RLS policy.
--
-- Both public write paths -- the adoption-application form
-- (src/lib/api/submit-application.functions.ts) and the donation form
-- (src/routes/api/donations.ts) -- run server-side with the Supabase
-- service-role key via createSupabaseServiceClient. service_role bypasses RLS
-- and does NOT use the anon / authenticated table grants, so the anon access
-- and the anonymous-insert policy removed below are unused by the application
-- and only widen the attack surface for direct PostgREST clients. None of the
-- changes here affect the service-role flows.

-- 1. Drop the stale "public insert" policy on adoption_applications.
--
-- Created in 20260611162956_create_adoption_applications_table.sql as
-- `for insert with check (true)` and never dropped: 20260626201620 replaced the
-- read/update/delete policies but left this one in place. It lets any anonymous
-- PostgREST client blind-insert arbitrary rows -- including status = 'approved'
-- -- bypassing the zod validation in submit-application.functions.ts. Genuine
-- inserts go through the service-role client, which ignores RLS, so this policy
-- is unused by the app and is purely a hole.
drop policy if exists "public insert" on public.adoption_applications;

-- 2. Revoke the unused anon table grants from the donations MVP.
--
-- Granted in 20260623160506_phase_2_donations_mvp.sql (lines 263-267) back when
-- an anonymous donation form was expected to write directly. The donation flow
-- now runs entirely server-side with the service-role key, so anon needs no
-- access to these tables. Revoking closes off anonymous direct reads/writes of
-- supporter PII and donation/payment records. revoke is a no-op if the grant is
-- already absent, so this stays safe to re-run.
revoke select, insert on public.supporter from anon;
revoke select, insert on public.consent from anon;
revoke select, insert on public.supporter_role from anon;
revoke select, insert on public.donation from anon;
revoke select, insert on public.payment from anon;

-- 3. Narrow the blanket `authenticated` grant -- minimally and safely.
--
-- 20260623160506 ran `grant select, insert, update, delete on all tables in
-- schema public to authenticated`. The authenticated admin UI is a browser
-- client (src/lib/supabase.ts) that, once an admin signs in, queries many of
-- these tables directly as the authenticated role, and every table is
-- additionally gated by an RLS policy keyed on private.has_admin_role(). The
-- blanket grant is therefore only *excess* on tables that have RLS enabled but
-- NO authenticated policy -- there an admin can never exercise the grant and it
-- is pure surplus privilege.
--
-- Those tables are recurring_mandate and receipt_sequence: both are written
-- only by service-role / SECURITY DEFINER code paths (the donation repository
-- and private.allocate_receipt_number) and neither is referenced by the
-- authenticated client. Revoke their inert authenticated grants.
--
-- A full revoke-and-re-grant of the blanket privilege was considered and
-- deliberately NOT done: the admin UI reads a large, still-growing set of
-- tables directly as authenticated (animals, animal_profile_internal,
-- animal_position, arrival_source, supporter, donation, payment, consent, ...),
-- so hand-maintaining an exact allow-list here would be fragile and easy to
-- break on future migrations, while adding no security beyond the RLS that
-- already gates every row.
revoke select, insert, update, delete on public.recurring_mandate from authenticated;
revoke select, insert, update, delete on public.receipt_sequence from authenticated;
