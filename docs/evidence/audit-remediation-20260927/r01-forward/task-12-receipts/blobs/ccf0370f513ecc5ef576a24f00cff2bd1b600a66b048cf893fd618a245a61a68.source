-- Candidate migration only. Runtime actors may append/read facts, but cannot
-- bypass append-only row triggers through TRUNCATE. No data is removed.
do $$ declare target record; begin
 for target in select schemaname,tablename from pg_tables where schemaname='public'
 and (tablename like 'volunteer_%' or tablename in ('audit_log','sponsorship_payment_proof','sponsorship_period','sponsorship_payment_allocation','sponsorship_payment_source','sponsorship_refund')) loop
  execute format('revoke truncate on table %I.%I from public,anon,authenticated,service_role',target.schemaname,target.tablename);
 end loop;
end $$;
revoke update,delete on public.audit_log from public,anon,authenticated,service_role;
