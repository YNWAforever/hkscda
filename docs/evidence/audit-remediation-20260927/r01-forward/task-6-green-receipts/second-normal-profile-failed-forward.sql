-- R01 Task 6: exact CRM atomic contracts and transaction actor fencing.
-- Only missing commands and ruled known unsafe actor bodies advance.
-- Every preflight finishes before creation/replacement. Unknown drift fails55000.
set local search_path = '';
do $migration$
declare v_function oid; v_catalog jsonb; v_actual jsonb; v_table oid; v_name text; v_hashes text[]; v_default record; v_public_create boolean; v_private_create boolean;
begin
  if current_user <> 'postgres' then raise exception 'R01 CRM owner context differs' using errcode='55000'; end if;
  if not pg_catalog.has_schema_privilege('service_role','private','USAGE')
    or pg_catalog.has_any_column_privilege('service_role','auth.users','SELECT,UPDATE')
    or not pg_catalog.has_table_privilege('postgres','auth.users','SELECT')
    or not pg_catalog.has_table_privilege('postgres','auth.users','UPDATE')
    or (select count(*) from pg_catalog.pg_attribute where attrelid='auth.users'::pg_catalog.regclass and not attisdropped and ((attname='id' and atttypid='uuid'::pg_catalog.regtype and attnotnull) or (attname in ('email_confirmed_at','banned_until') and atttypid='timestamptz'::pg_catalog.regtype)))<>3 then
    raise exception 'R01 CRM managed Auth prerequisites differ' using errcode='55000';
  end if;
  -- Same normalized catalog projection as the reviewed schema clone. Only the
  -- five CRM write/actor tables below are bound; other domains are not rewritten.
  select catalog into v_catalog from (with pinned as materialized (select pg_catalog.set_config('search_path','',true)) select jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable) order by pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]'::jsonb) from aclexplode(coalesce(nspacl,acldefault('n',nspowner))) x)) order by nspname) from pg_namespace where nspname in ('public','private')),
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable) order by pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]'::jsonb) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) x),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions,'replicaIdentity',c.relreplident) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'columns',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'collation',(select cn.nspname||'.'||co.collname from pg_collation co join pg_namespace cn on cn.oid=co.collnamespace where co.oid=a.attcollation),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable) order by pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]'::jsonb) from aclexplode(a.attacl) x),'default',pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),
 'sequences',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'type',format_type(s.seqtypid,-1),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'ownedBy',(select jsonb_build_object('schema',tn.nspname,'table',tc.relname,'column',a.attname,'dependency',d.deptype) from pg_depend d join pg_class tc on tc.oid=d.refobjid join pg_namespace tn on tn.oid=tc.relnamespace join pg_attribute a on a.attrelid=tc.oid and a.attnum=d.refobjsubid where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_class'::regclass and d.deptype in ('a','i'))) order by n.nspname,c.relname) from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable) order by pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]'::jsonb) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'bodyMd5',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',con.conname,'type',con.contype,'validated',con.convalidated,'definition',pg_get_constraintdef(con.oid,true)) order by n.nspname,c.relname,con.conname) from pg_constraint con join pg_namespace n on n.oid=con.connamespace left join pg_class c on c.oid=con.conrelid where n.nspname in ('public','private')),
 'indexes',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique) order by n.nspname,c.relname,pg_get_indexdef(i.indexrelid)) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal),
 'policies',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by n.nspname,c.relname,p.polname) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'defaults',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,''),'kind',d.defaclobjtype,'entries',(select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type) from aclexplode(d.defaclacl) a)) order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in ('public','private')),
 'types',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable) order by pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]'::jsonb) from aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) x),'enum',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)) order by n.nspname,t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private')),
 'views',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definitionMd5',md5(pg_get_viewdef(c.oid,true))) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')),
 'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where n.nspname in ('public','private')),
 'extensionMembers',(select jsonb_agg(jsonb_build_object('extension',e.extname,'object',pg_describe_object(d.classid,d.objid,d.objsubid)) order by e.extname,pg_describe_object(d.classid,d.objid,d.objsubid)) from pg_depend d join pg_extension e on e.oid=d.refobjid join pg_namespace n on n.oid=e.extnamespace where d.refclassid='pg_extension'::regclass and d.deptype='e' and n.nspname in ('public','private')),
 'databaseOwner',(select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'login',rolcanlogin,'bypassRls',rolbypassrls) order by rolname) from pg_roles where rolname in ('anon','authenticated','service_role','postgres','supabase_admin')),
 'memberships',(select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option) order by pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)) from pg_auth_members where pg_get_userbyid(member) in ('anon','authenticated','service_role'))
) catalog from pinned) captured;
  v_name := 'supporter'; v_table := pg_catalog.to_regclass('public.'||v_name);
  if v_table is null then raise exception 'R01 CRM prerequisite table absent: supporter' using errcode='55000'; end if;
  select pg_catalog.jsonb_object_agg(k,(select pg_catalog.jsonb_agg(e.value order by e.ordinality) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))
    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual
  from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;
  -- Empty facets are [] in the captured profile, never SQL NULL.
  select pg_catalog.jsonb_object_agg(key,case when value='null'::jsonb then '[]'::jsonb else value end) into v_actual from pg_catalog.jsonb_each(v_actual);
  if pg_catalog.md5(v_actual::text) not in ('7332a9caaf51755403cd1d969b84cc32','a42bd07efe37720bb21b5ec28eb43225') then raise exception 'R01 CRM table metadata differs: supporter' using errcode='55000'; end if;
  v_name := 'supporter_role'; v_table := pg_catalog.to_regclass('public.'||v_name);
  if v_table is null then raise exception 'R01 CRM prerequisite table absent: supporter_role' using errcode='55000'; end if;
  select pg_catalog.jsonb_object_agg(k,(select pg_catalog.jsonb_agg(e.value order by e.ordinality) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))
    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual
  from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;
  -- Empty facets are [] in the captured profile, never SQL NULL.
  select pg_catalog.jsonb_object_agg(key,case when value='null'::jsonb then '[]'::jsonb else value end) into v_actual from pg_catalog.jsonb_each(v_actual);
  if pg_catalog.md5(v_actual::text) not in ('87532418f98a87b3b789cfd1f34acc67','045753840524751e6649febeb459dc2a') then raise exception 'R01 CRM table metadata differs: supporter_role' using errcode='55000'; end if;
  v_name := 'consent'; v_table := pg_catalog.to_regclass('public.'||v_name);
  if v_table is null then raise exception 'R01 CRM prerequisite table absent: consent' using errcode='55000'; end if;
  select pg_catalog.jsonb_object_agg(k,(select pg_catalog.jsonb_agg(e.value order by e.ordinality) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))
    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual
  from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;
  -- Empty facets are [] in the captured profile, never SQL NULL.
  select pg_catalog.jsonb_object_agg(key,case when value='null'::jsonb then '[]'::jsonb else value end) into v_actual from pg_catalog.jsonb_each(v_actual);
  if pg_catalog.md5(v_actual::text) not in ('eaa88bf2fd7482a00807bde192cc6833','b3221019a30504c11abd7f4344e56f8e') then raise exception 'R01 CRM table metadata differs: consent' using errcode='55000'; end if;
  v_name := 'audit_log'; v_table := pg_catalog.to_regclass('public.'||v_name);
  if v_table is null then raise exception 'R01 CRM prerequisite table absent: audit_log' using errcode='55000'; end if;
  select pg_catalog.jsonb_object_agg(k,(select pg_catalog.jsonb_agg(e.value order by e.ordinality) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))
    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual
  from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;
  -- Empty facets are [] in the captured profile, never SQL NULL.
  select pg_catalog.jsonb_object_agg(key,case when value='null'::jsonb then '[]'::jsonb else value end) into v_actual from pg_catalog.jsonb_each(v_actual);
  if pg_catalog.md5(v_actual::text) not in ('13e61b2259f1fc4962883a22c234dd14','872b12891d5c2eef68541dc5bf6e8361') then raise exception 'R01 CRM table metadata differs: audit_log' using errcode='55000'; end if;
  v_name := 'admin_user'; v_table := pg_catalog.to_regclass('public.'||v_name);
  if v_table is null then raise exception 'R01 CRM prerequisite table absent: admin_user' using errcode='55000'; end if;
  select pg_catalog.jsonb_object_agg(k,(select pg_catalog.jsonb_agg(e.value order by e.ordinality) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))
    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual
  from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;
  -- Empty facets are [] in the captured profile, never SQL NULL.
  select pg_catalog.jsonb_object_agg(key,case when value='null'::jsonb then '[]'::jsonb else value end) into v_actual from pg_catalog.jsonb_each(v_actual);
  if pg_catalog.md5(v_actual::text) not in ('845081202bd288023cb4da40205fd3a7','14f4dc5f9e06e053f4efeff6d5589045') then raise exception 'R01 CRM table metadata differs: admin_user' using errcode='55000'; end if;
  -- Native RI enforcement is not in the public snapshot. All four ordinary
  -- enabled triggers and their single internal constraint dependency are required.
  if exists(select 1 from pg_catalog.pg_constraint c where c.conrelid in ('public.supporter'::regclass,'public.supporter_role'::regclass,'public.consent'::regclass,'public.admin_user'::regclass) and c.contype='f' and (
    c.confupdtype<>'a' or c.confdeltype not in ('a','c') or c.condeferrable or c.condeferred
    or (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid)<>4
    or exists(select 1 from (values ('pg_catalog."RI_FKey_check_ins"()'::regprocedure,5,true),('pg_catalog."RI_FKey_check_upd"()'::regprocedure,17,true),('pg_catalog."RI_FKey_noaction_upd"()'::regprocedure,17,false),(case when c.confdeltype='c' then 'pg_catalog."RI_FKey_cascade_del"()'::regprocedure else 'pg_catalog."RI_FKey_noaction_del"()'::regprocedure end,9,false)) expected(function_oid,event_type,own_side) where (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid and t.tgrelid=case when expected.own_side then c.conrelid else c.confrelid end and t.tgconstrrelid=case when expected.own_side then c.confrelid else c.conrelid end and t.tgconstrindid=c.conindid and t.tgfoid=expected.function_oid and t.tgtype=expected.event_type and t.tgenabled='O' and t.tgisinternal and t.tgparentid=0 and not t.tgdeferrable and not t.tginitdeferred and t.tgnargs=0 and t.tgattr::text='' and t.tgargs=''::bytea and t.tgqual is null and t.tgoldtable is null and t.tgnewtable is null and (select count(*) from pg_catalog.pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid)=1 and exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid and d.objsubid=0 and d.refclassid='pg_constraint'::regclass and d.refobjid=c.oid and d.refobjsubid=0 and d.deptype='i'))<>1)
  )) then raise exception 'R01 CRM native FK enforcement differs' using errcode='55000'; end if;
  -- Preserve149/177 version trigger helpers; only two exact reviewed bump profiles.
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid='private.bump_supporter_edit_version()'::regprocedure and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('d1fd0a986ef9bb089e9d5025e4177a49','08619e0337db72d3d685130718c47538'))
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid='private.bump_supporter_edit_version_from_role()'::regprocedure and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='3b3d61191955f415e4ed1a22389d71fb') then raise exception 'R01 CRM version trigger helpers differ' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='mutate_crm_supporter_with_audit')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 CRM overload/required function differs: mutate_crm_supporter_with_audit' using errcode='55000'; end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_operation text, p_supporter_id uuid, p_input jsonb, p_roles jsonb, p_actor_user_id uuid, p_at timestamp with time zone, p_detail jsonb' and pg_catalog.pg_get_function_result(p.oid)='jsonb' and pg_catalog.md5(p.prosrc) in ('a239e42582809956b821b1bfe1fb2962','b855a871526b63f13a1d653757a2f4c1'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 CRM function contract differs: mutate_crm_supporter_with_audit' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.replace_supporter_roles_atomic(uuid,jsonb)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='replace_supporter_roles_atomic')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 CRM overload/required function differs: replace_supporter_roles_atomic' using errcode='55000'; end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_supporter_id uuid, p_roles jsonb' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(p.prosrc) in ('f2c7e2d7478e45b8320a59b43b56f818'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 CRM function contract differs: replace_supporter_roles_atomic' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='append_crm_consents_with_audit')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 CRM overload/required function differs: append_crm_consents_with_audit' using errcode='55000'; end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_rows jsonb, p_actor_user_id uuid, p_supporter_id uuid, p_at timestamp with time zone, p_detail jsonb' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(p.prosrc) in ('65f1847569ad471a239e0c1a1dd60324','fad2e7acedab10443930040b3e667939'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 CRM function contract differs: append_crm_consents_with_audit' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)');
  if v_function is null or (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='mutate_crm_supporter_if_version_with_audit')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 CRM overload/required function differs: mutate_crm_supporter_if_version_with_audit' using errcode='55000'; end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_supporter_id uuid, p_expected_version bigint, p_input jsonb, p_roles jsonb, p_actor_user_id uuid, p_at timestamp with time zone, p_detail jsonb' and pg_catalog.pg_get_function_result(p.oid)='jsonb' and pg_catalog.md5(p.prosrc) in ('c39e9474fb941717626a0e9e3afd1477','f6963da392c67e51fea8e5b451698238'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 CRM function contract differs: mutate_crm_supporter_if_version_with_audit' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('private.require_crm_supporter_actor(uuid)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='private'::regnamespace and proname='require_crm_supporter_actor')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 CRM overload/required function differs: require_crm_supporter_actor' using errcode='55000'; end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_actor uuid' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(p.prosrc) in ('60f3f9ec8d075cfd67c0e992d2667030'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 CRM function contract differs: require_crm_supporter_actor' using errcode='55000'; end if;
  v_public_create := pg_catalog.to_regprocedure('public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)') is null or pg_catalog.to_regprocedure('public.replace_supporter_roles_atomic(uuid,jsonb)') is null or pg_catalog.to_regprocedure('public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb)') is null or pg_catalog.to_regprocedure('public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)') is null;
  v_private_create := pg_catalog.to_regprocedure('private.require_crm_supporter_actor(uuid)') is null;
  -- Current postgres creation defaults: global baseline plus schema additions.
  -- Never strip an unfamiliar recipient or modify creator defaults.
  for v_default in select d.* from pg_catalog.pg_default_acl d where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and ((d.defaclnamespace=0 and (v_public_create or v_private_create)) or (d.defaclnamespace='public'::regnamespace and v_public_create) or (d.defaclnamespace='private'::regnamespace and v_private_create)) loop
    if exists(select 1 from pg_catalog.aclexplode(v_default.defaclacl) a where a.grantor<>'postgres'::regrole or a.is_grantable or a.grantee not in(0,'postgres'::regrole,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole) or a.privilege_type<>'EXECUTE') or (v_default.defaclnamespace=0 and (select array_agg(a.privilege_type order by a.privilege_type) from pg_catalog.aclexplode(v_default.defaclacl) a where a.grantee='postgres'::regrole) is distinct from array['EXECUTE']::text[]) then raise exception 'R01 CRM function creation default ACL differs' using errcode='55000'; end if;
  end loop;
  -- No writes precede this line. Exact good definitions retain their OIDs/ACLs.
  v_function := pg_catalog.to_regprocedure('private.require_crm_supporter_actor(uuid)');
  if v_function is null or (select pg_catalog.md5(prosrc) from pg_catalog.pg_proc where oid=v_function)<>'60f3f9ec8d075cfd67c0e992d2667030' then
    execute $definition$create or replace function private.require_crm_supporter_actor(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Own-domain Auth then admin SHARE fences non-key ban/role/status changes.
  perform 1 from auth.users u
  where u.id = p_actor and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'supporter_edit_forbidden' using errcode = '42501';
  end if;
  perform 1 from public.admin_user a
  where a.auth_user_id = p_actor and a.status = 'active'
    and a.role in ('treasurer', 'admin')
  for share;
  if not found then
    raise exception 'supporter_edit_forbidden' using errcode = '42501';
  end if;
end;
$function$;$definition$;
    if v_function is null then
      revoke all on function private.require_crm_supporter_actor(uuid) from public,anon,authenticated,service_role;
      grant execute on function private.require_crm_supporter_actor(uuid) to service_role;
    end if;
  end if;
  v_function := pg_catalog.to_regprocedure('public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)');
  if v_function is null or (select pg_catalog.md5(prosrc) from pg_catalog.pg_proc where oid=v_function)<>'b855a871526b63f13a1d653757a2f4c1' then
    execute $definition$create or replace function public.mutate_crm_supporter_with_audit(p_operation text, p_supporter_id uuid, p_input jsonb, p_roles jsonb, p_actor_user_id uuid, p_at timestamp with time zone, p_detail jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_supporter public.supporter;
begin
  perform private.require_crm_supporter_actor(p_actor_user_id);
  if p_operation = 'create' then
    if p_input is null or p_roles is null or jsonb_typeof(p_roles) <> 'array' then
      raise exception 'invalid_supporter_payload';
    end if;
    insert into public.supporter(name,email,phone,language,tags,source,deleted_at)
    values (
      p_input->>'name', (p_input->>'email')::public.citext, p_input->>'phone',
      p_input->>'language',
      array(select jsonb_array_elements_text(p_input->'tags')),
      p_input->>'source', null
    )
    on conflict (email) do update set
      name = excluded.name,
      phone = excluded.phone,
      language = excluded.language,
      tags = excluded.tags,
      source = excluded.source,
      deleted_at = null
    returning * into v_supporter;
  elsif p_operation = 'update' then
    if p_supporter_id is null or p_input is null then
      raise exception 'invalid_supporter_payload';
    end if;
    update public.supporter set
      name = case when p_input ? 'name' then p_input->>'name' else name end,
      phone = case when p_input ? 'phone' then p_input->>'phone' else phone end,
      language = case when p_input ? 'language' then p_input->>'language' else language end,
      tags = case when p_input ? 'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else tags end,
      deleted_at = case when p_input ? 'deleted_at' then (p_input->>'deleted_at')::timestamptz else deleted_at end
    where id = p_supporter_id
    returning * into v_supporter;
    if not found then
      raise exception 'supporter_not_found';
    end if;
  else
    raise exception 'invalid_supporter_operation';
  end if;

  if p_roles is not null then
    if jsonb_typeof(p_roles) <> 'array' then
      raise exception 'invalid_supporter_roles';
    end if;
    delete from public.supporter_role where supporter_id = v_supporter.id;
    insert into public.supporter_role(supporter_id, role)
    select v_supporter.id, role from jsonb_array_elements_text(p_roles) as role;
  end if;

  insert into public.audit_log(actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (
    p_actor_user_id,
    case when p_operation = 'create' then 'supporter.create_or_update' else 'supporter.update' end,
    'supporter', v_supporter.id::text, p_at, coalesce(p_detail, '{}'::jsonb)
  );
  return jsonb_build_object('id', v_supporter.id, 'email', v_supporter.email);
end;
$function$;$definition$;
    if v_function is null then
      revoke all on function public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
      grant execute on function public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb) to service_role;
    end if;
  end if;
  v_function := pg_catalog.to_regprocedure('public.replace_supporter_roles_atomic(uuid,jsonb)');
  if v_function is null or (select pg_catalog.md5(prosrc) from pg_catalog.pg_proc where oid=v_function)<>'f2c7e2d7478e45b8320a59b43b56f818' then
    execute $definition$create or replace function public.replace_supporter_roles_atomic(p_supporter_id uuid, p_roles jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' then
    raise exception 'invalid_supporter_roles';
  end if;
  perform 1 from public.supporter where id = p_supporter_id for update;
  if not found then
    raise exception 'supporter_not_found';
  end if;
  delete from public.supporter_role where supporter_id = p_supporter_id;
  insert into public.supporter_role(supporter_id, role)
  select p_supporter_id, role from jsonb_array_elements_text(p_roles) as role;
end;
$function$;$definition$;
    if v_function is null then
      revoke all on function public.replace_supporter_roles_atomic(uuid,jsonb) from public,anon,authenticated,service_role;
      grant execute on function public.replace_supporter_roles_atomic(uuid,jsonb) to service_role;
    end if;
  end if;
  v_function := pg_catalog.to_regprocedure('public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb)');
  if v_function is null or (select pg_catalog.md5(prosrc) from pg_catalog.pg_proc where oid=v_function)<>'fad2e7acedab10443930040b3e667939' then
    execute $definition$create or replace function public.append_crm_consents_with_audit(p_rows jsonb, p_actor_user_id uuid, p_supporter_id uuid, p_at timestamp with time zone, p_detail jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_consent_rows' using errcode = '22023';
  end if;
  if p_supporter_id is null or jsonb_array_length(p_rows) = 0 or exists (
    select 1 from jsonb_array_elements(p_rows) as row
    where jsonb_typeof(row) <> 'object'
      or row->>'supporter_id' is distinct from p_supporter_id::text
  ) then
    raise exception 'invalid_consent_rows' using errcode = '22023';
  end if;
  perform private.require_crm_supporter_actor(p_actor_user_id);
  perform 1 from public.supporter where id = p_supporter_id for update;
  if not found then
    raise exception 'supporter_not_found';
  end if;
  insert into public.consent(supporter_id, channel, status, source, "timestamp")
  select p_supporter_id, row->>'channel', row->>'status', row->>'source', (row->>'timestamp')::timestamptz
  from jsonb_array_elements(p_rows) as row
  on conflict (supporter_id, channel, status, source, "timestamp") do nothing;
  insert into public.audit_log(actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (p_actor_user_id, 'consent.append', 'supporter', p_supporter_id::text, p_at, coalesce(p_detail, '{}'::jsonb));
end;
$function$;$definition$;
    if v_function is null then
      revoke all on function public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
      grant execute on function public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb) to service_role;
    end if;
  end if;
  v_function := pg_catalog.to_regprocedure('public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)');
  if v_function is null or (select pg_catalog.md5(prosrc) from pg_catalog.pg_proc where oid=v_function)<>'f6963da392c67e51fea8e5b451698238' then
    execute $definition$create or replace function public.mutate_crm_supporter_if_version_with_audit(p_supporter_id uuid, p_expected_version bigint, p_input jsonb, p_roles jsonb, p_actor_user_id uuid, p_at timestamp with time zone, p_detail jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_supporter public.supporter%rowtype;
  v_current_roles text[];
  v_new_roles text[];
begin
  if p_supporter_id is null or p_expected_version is null or p_expected_version < 1
    or p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'invalid_supporter_payload' using errcode = '22023';
  end if;
  perform private.require_crm_supporter_actor(p_actor_user_id);
  select * into v_supporter from public.supporter
  where id = p_supporter_id for update;
  if not found then
    raise exception 'supporter_not_found' using errcode = 'P4040';
  end if;
  if v_supporter.edit_version <> p_expected_version then
    raise exception 'supporter_version_conflict' using errcode = 'P4090';
  end if;
  if p_roles is not null and
    (jsonb_typeof(p_roles) <> 'array' or jsonb_array_length(p_roles) = 0) then
    raise exception 'invalid_supporter_roles' using errcode = '22023';
  end if;

  update public.supporter set
    name = case when p_input ? 'name' then p_input->>'name' else name end,
    phone = case when p_input ? 'phone' then p_input->>'phone' else phone end,
    language = case when p_input ? 'language' then p_input->>'language' else language end,
    tags = case when p_input ? 'tags'
      then array(select jsonb_array_elements_text(p_input->'tags')) else tags end,
    deleted_at = case when p_input ? 'deleted_at'
      then (p_input->>'deleted_at')::timestamptz else deleted_at end
  where id = p_supporter_id;

  if p_roles is not null then
    select array_agg(role order by role) into v_current_roles
      from public.supporter_role where supporter_id = p_supporter_id;
    select array_agg(role order by role) into v_new_roles
      from jsonb_array_elements_text(p_roles) as role;
    if v_current_roles is distinct from v_new_roles then
      delete from public.supporter_role where supporter_id = p_supporter_id;
      insert into public.supporter_role(supporter_id, role)
      select p_supporter_id, role from jsonb_array_elements_text(p_roles) as role;
    end if;
  end if;

  insert into public.audit_log(actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (p_actor_user_id, 'supporter.update', 'supporter',
    p_supporter_id::text, p_at, coalesce(p_detail, '{}'::jsonb));
  select * into v_supporter from public.supporter where id = p_supporter_id;
  return jsonb_build_object('id', v_supporter.id, 'email', v_supporter.email,
    'editVersion', v_supporter.edit_version);
end;
$function$;$definition$;
    if v_function is null then
      revoke all on function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
      grant execute on function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) to service_role;
    end if;
  end if;
end;
$migration$;
