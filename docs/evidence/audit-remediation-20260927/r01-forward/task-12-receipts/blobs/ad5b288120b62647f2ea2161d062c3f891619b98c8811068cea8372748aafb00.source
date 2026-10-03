-- Close the remaining latent default anon write-grants.
--
-- Supabase's project bootstrap grants ALL privileges to anon on every public
-- table by default. 20260628140000 fully revoked anon on the donor-PII tables;
-- this does the same for the two other tables anon still carries grants on:
--
--   * animals -- the public site reads it as anon (RLS limits rows to
--     status = 'available'), so SELECT is KEPT. The default write grants
--     (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) are inert -- writes are
--     admin-only via RLS (see 20260627091500_tighten_animals_admin_policy.sql) --
--     but they are surplus privilege, so revoke them.
--   * adoption_applications -- applications are written by the service-role
--     client (src/lib/api/submit-application.functions.ts); anon needs nothing
--     after 20260628130000 dropped the stale "public insert" policy. Revoke all.
--
-- Latent rather than exploitable today (RLS default-denies), but this removes the
-- single-policy-away landmine. revoke is a no-op when the privilege is already
-- absent, so this migration is safely re-runnable.
revoke insert, update, delete, truncate, references, trigger on public.animals from anon;
revoke all on public.adoption_applications from anon;
