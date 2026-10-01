"""Rehearse exact quality read SQL on the named synthetic schema-only clone."""
from pathlib import Path
import hashlib,subprocess,time
p=Path(__file__).resolve().parent.parent/'supabase/migrations/20260927211801_editorial_quality_queue.sql'
migration=p.read_text(encoding='utf-8')
sql="""
begin;set local lock_timeout='5s';set local statement_timeout='30s';
do $$ begin if exists(select 1 from public.content_item) or exists(select 1 from auth.users) then raise exception 'Expected empty isolated clone';end if;end $$;
drop function public.editorial_quality_queue(uuid,integer,text);
drop index public.content_item_quality_class_idx;drop index public.content_item_quality_expiry_idx;
insert into public.content_item(id,slug,type,title,summary,status,content_class,source_reference) select gen_random_uuid(),'synthetic-quality-rehearsal-'||n,'report','Synthetic legacy '||n,'Synthetic','draft','unreviewed',null from generate_series(1,7) n;
create temporary table quality_before as select md5(string_agg(to_jsonb(c)::text,'|' order by id)) digest from public.content_item c;
"""+migration+"""
do $$ begin
 if (select digest from quality_before)<>(select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from public.content_item c) then raise exception 'Content changed';end if;
 if not has_function_privilege('service_role','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') or has_function_privilege('anon','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') or has_function_privilege('authenticated','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') then raise exception 'Unexpected grants';end if;
end $$;
select '7 synthetic legacy rows unchanged; exact signature/grants verified' result;
rollback;
select (select count(*) from public.content_item) content,(select count(*) from auth.users) auth_users;
select prosecdef,provolatile,proconfig from pg_proc where oid='public.editorial_quality_queue(uuid,integer,text)'::regprocedure;
select indexname,indexdef from pg_indexes where schemaname='public' and indexname in ('content_item_quality_class_idx','content_item_quality_expiry_idx');
"""
start=time.perf_counter();r=subprocess.run(['docker','exec','-i','supabase_db_hkscda-audit-integration-fresh','psql','-U','postgres','-d','audit_pr135_20260929','-X','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True)
print(r.stdout.decode());print(r.stderr.decode());print('sha256',hashlib.sha256(p.read_bytes()).hexdigest(),'elapsed_ms',round((time.perf_counter()-start)*1000),'exit',r.returncode);raise SystemExit(r.returncode)
