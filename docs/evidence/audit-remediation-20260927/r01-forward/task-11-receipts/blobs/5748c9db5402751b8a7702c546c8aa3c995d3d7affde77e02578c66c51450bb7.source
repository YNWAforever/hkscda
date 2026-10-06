-- Complete the anon lockdown on donor-PII tables.
--
-- 20260628130000 revoked SELECT, INSERT from anon on these tables, matching the
-- explicit grants in 20260623160506_phase_2_donations_mvp.sql. But Supabase's
-- project bootstrap additionally grants ALL privileges to anon on public tables
-- by default, so anon retained UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER
-- (confirmed live via information_schema.role_table_grants). RLS still
-- default-denies (these tables have RLS enabled and no anon policy), so this is
-- latent rather than exploitable today -- but it leaves the same
-- single-policy-away landmine the previous migration set out to remove.
--
-- anon needs ZERO access to these tables: both the donation flow
-- (src/routes/api/donations.ts) and the adoption-application flow
-- (src/lib/api/submit-application.functions.ts) write via the service-role
-- client, which bypasses grants and RLS. Revoke everything. Tables the public
-- site genuinely reads as anon (e.g. animals) are deliberately left untouched.
-- revoke is a no-op when the privilege is already absent, so this is re-runnable.
revoke all on public.supporter from anon;
revoke all on public.consent from anon;
revoke all on public.supporter_role from anon;
revoke all on public.donation from anon;
revoke all on public.payment from anon;
