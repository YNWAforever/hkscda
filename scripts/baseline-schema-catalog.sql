with tables as (
select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relkind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p','v','m')
and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), objects as (
select 'relation' kind,t.nspname||'.'||t.relname key,jsonb_build_object(
'kind',t.relkind,'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(ad.adbin,ad.adrelid),a.attidentity,a.attgenerated) order by a.attnum)::text,'')) from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid,true)) order by conname)::text,'')) from pg_constraint where conrelid=t.oid),
'indexes',(select md5(coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text)::text,'')) from pg_index where indrelid=t.oid),
'triggers',(select md5(coalesce(jsonb_agg(pg_get_triggerdef(oid,true) order by tgname)::text,'')) from pg_trigger where tgrelid=t.oid and not tgisinternal),
'policies',(select md5(coalesce(jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check) order by policyname)::text,'')) from pg_policies where schemaname=t.nspname and tablename=t.relname),
'grants',(select jsonb_agg(jsonb_build_array(r,p,has_table_privilege(r,t.oid,p)) order by r,p) from unnest(array['anon','authenticated','service_role'])r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])p)
) value from tables t
union all
select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
jsonb_build_object('result',pg_get_function_result(p.oid),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'body_md5',md5(p.prosrc),'normalized_body_md5',md5(regexp_replace(btrim(p.prosrc),'\s+',' ','g')),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'
and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
union all
select 'enum',n.nspname||'.'||t.typname,jsonb_agg(e.enumlabel order by e.enumsortorder)
from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','private') group by n.nspname,t.typname
) select kind,key,value from objects order by kind,key;