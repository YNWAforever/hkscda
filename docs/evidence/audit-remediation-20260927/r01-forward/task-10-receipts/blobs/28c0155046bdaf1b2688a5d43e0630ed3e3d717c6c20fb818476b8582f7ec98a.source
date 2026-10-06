-- RLS does not protect TRUNCATE, and runtime browser roles never need to
-- create foreign keys or triggers. Existing Supabase default grants included
-- these maintenance privileges on public tables, including webhook_event.
revoke truncate, references, trigger on all tables in schema public
  from public, anon, authenticated;

-- Project migrations create public tables as postgres. Keep future tables
-- from regaining the same privileges through schema defaults.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from public, anon, authenticated;