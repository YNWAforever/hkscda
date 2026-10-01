"""Exact #165 SQL rehearsal on the named disposable, schema-only clone. No ledger writes."""
from pathlib import Path
import hashlib, subprocess, time
sql_path=Path(__file__).resolve().parent.parent/'supabase/migrations/20260927201916_manual_payment_atomic_reference.sql'
migration=sql_path.read_text(encoding='utf-8')
seed="""
begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
do $$ begin if (select count(*) from public.payment)<>0 or (select count(*) from auth.users)<>0 then raise exception 'Expected empty isolated clone'; end if;end $$;
drop index if exists public.payment_manual_bank_reference_unique;
create temporary table finance_fixture(n integer,donation uuid,payment uuid,supporter uuid);
insert into finance_fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(1,6) n;
insert into public.supporter(id,name,email) select supporter,'Synthetic legacy finance',supporter||'@example.invalid' from finance_fixture;
insert into public.donation(id,supporter_id,amount_cents,purpose,method) select donation,supporter,10000,'general','fps' from finance_fixture;
insert into public.payment(id,donation_id,provider,amount_cents,bank_reference) select payment,donation,'fps',10000,'SYNTHETIC-LEGACY-'||n from finance_fixture;
update public.payment p set status='succeeded' from finance_fixture f where p.id=f.payment and f.n<=3;
update public.donation d set status='succeeded' from finance_fixture f where d.id=f.donation and f.n<=3;
create temporary table finance_before as select 'payment' kind,md5(string_agg(to_jsonb(p)::text,'|' order by id)) digest from public.payment p union all select 'donation',md5(string_agg(to_jsonb(d)::text,'|' order by id)) from public.donation d;
"""
verify="""
do $$ begin
 if (select digest from finance_before where kind='payment')<>(select md5(string_agg(to_jsonb(p)::text,'|' order by id)) from public.payment p) or (select digest from finance_before where kind='donation')<>(select md5(string_agg(to_jsonb(d)::text,'|' order by id)) from public.donation d) then raise exception 'Legacy fields changed';end if;
 if not has_function_privilege('service_role','public.reconcile_manual_payment_atomic(uuid,uuid,text)','EXECUTE') or has_function_privilege('anon','public.reconcile_manual_payment_atomic(uuid,uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.reconcile_manual_payment_atomic(uuid,uuid,text)','EXECUTE') then raise exception 'Unexpected RPC grants';end if;
end $$;
select '6 synthetic legacy payments/donations unchanged; index and service grants verified' as result;
rollback;
"""
duplicate=seed+"update public.payment set bank_reference=' DUPLICATE ' where id in (select payment from finance_fixture where n<=2);\n"+"do $drill$ begin begin execute $candidate$"+migration+"$candidate$; raise exception 'Duplicate historical references incorrectly accepted'; exception when unique_violation then raise notice 'Duplicate historical references rejected; no deduplication'; end;end $drill$;\nrollback;\n"
post="""
select (select count(*) from public.payment) payments,(select count(*) from public.donation) donations,(select count(*) from public.supporter) supporters,(select count(*) from auth.users) auth_users,(select count(*) from public.donation_delivery_job) jobs;
select prosecdef,proconfig,has_function_privilege('service_role',oid,'EXECUTE') service_execute,has_function_privilege('authenticated',oid,'EXECUTE') authenticated_execute from pg_proc where oid='public.reconcile_manual_payment_atomic(uuid,uuid,text)'::regprocedure;
"""
start=time.perf_counter()
result=subprocess.run(['docker','exec','-i','supabase_db_hkscda-audit-integration-fresh','psql','-U','postgres','-d','audit_pr135_20260929','-X','-v','ON_ERROR_STOP=1'],input=(seed+migration+verify+duplicate+post).encode(),capture_output=True)
print(result.stdout.decode());print(result.stderr.decode())
print('SHA256',hashlib.sha256(sql_path.read_bytes()).hexdigest(),'elapsed_ms',round((time.perf_counter()-start)*1000),'exit',result.returncode)
raise SystemExit(result.returncode)
