-- R01 Task 5: animal draft intent and same-transaction audited archive.
-- Preflight ALL existing objects before any mutation; unknown profiles fail55000.
-- Existing good media bodies/metadata remain; only the reviewed unsafe archive
-- body can advance to the exact actor-fenced body. No Auth/table role grant expands.
set local search_path = '';
do $migration$
declare v_table oid; v_draft oid; v_function oid; v_actual jsonb; v_acl text[];
begin
  if current_user <> 'postgres' then raise exception 'R01 animal requires postgres owner context' using errcode='55000'; end if;
  if not pg_catalog.has_schema_privilege('service_role','private','USAGE') then
    raise exception 'R01 animal private schema prerequisite differs' using errcode='55000';
  end if;
  if pg_catalog.has_table_privilege('service_role','auth.users','SELECT,UPDATE')
    or not pg_catalog.has_table_privilege('postgres','auth.users','SELECT')
    or not pg_catalog.has_table_privilege('postgres','auth.users','UPDATE')
    or (select count(*) from pg_catalog.pg_attribute where attrelid='auth.users'::pg_catalog.regclass and not attisdropped and ((attname='id' and atttypid='uuid'::pg_catalog.regtype and attnotnull) or (attname in ('email_confirmed_at','banned_until') and atttypid='timestamptz'::pg_catalog.regtype)))<>3
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.admin_user'::pg_catalog.regclass and not attisdropped and ((attname='auth_user_id' and atttypid='uuid'::pg_catalog.regtype and attnotnull) or (attname in ('role','status') and atttypid='text'::pg_catalog.regtype and attnotnull)))<>3
    or not exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_index i on i.indexrelid=c.conindid where c.conrelid='public.admin_user'::pg_catalog.regclass and c.conname='admin_user_auth_user_id_key' and c.contype='u' and c.convalidated and not c.condeferrable and not c.condeferred and i.indisvalid and i.indisready and pg_catalog.pg_get_constraintdef(c.oid,true)='UNIQUE (auth_user_id)') then
    raise exception 'R01 animal actor bridge prerequisites differ' using errcode='55000';
  end if;
  v_draft := pg_catalog.to_regclass('public.animal_draft');
  if v_draft is null or not exists(select 1 from pg_catalog.pg_class where oid=v_draft and relkind='r' and relpersistence='p' and relowner='postgres'::pg_catalog.regrole and relrowsecurity and not relhasrules and not exists(select 1 from pg_catalog.pg_rewrite where ev_class=v_draft)) then
    raise exception 'R01 animal draft prerequisite relation differs' using errcode='55000';
  end if;
  if (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',conname,'type',contype,'validated',convalidated,'definition',pg_catalog.pg_get_constraintdef(oid,true)) order by conname) from pg_catalog.pg_constraint where conrelid=v_draft and contype='f') is distinct from $fk$[{"name":"animal_draft_id_fkey","type":"f","validated":true,"definition":"FOREIGN KEY (id) REFERENCES public.animals(id)"},{"name":"animal_draft_updated_by_fkey","type":"f","validated":true,"definition":"FOREIGN KEY (updated_by) REFERENCES auth.users(id)"}]$fk$::jsonb then raise exception 'R01 animal draft prerequisite FKs differ' using errcode='55000'; end if;
  -- Each reviewed FK owns four ordinary origin-enabled RI triggers, including
  -- DELETE/UPDATE actions on its referenced table. Constraint validity alone
  -- does not prove that these enforcement triggers are enabled or intact.
  if exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=v_draft and c.contype='f' and (
    (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid)<>4
    or exists(select 1 from (values
      ('pg_catalog."RI_FKey_check_ins"()'::pg_catalog.regprocedure,5,true),
      ('pg_catalog."RI_FKey_check_upd"()'::pg_catalog.regprocedure,17,true),
      ('pg_catalog."RI_FKey_noaction_del"()'::pg_catalog.regprocedure,9,false),
      ('pg_catalog."RI_FKey_noaction_upd"()'::pg_catalog.regprocedure,17,false)
    ) expected(function_oid,event_type,intent_side) where (
      select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid
        and t.tgrelid=case when expected.intent_side then c.conrelid else c.confrelid end
        and t.tgconstrrelid=case when expected.intent_side then c.confrelid else c.conrelid end
        and t.tgconstrindid=c.conindid and t.tgfoid=expected.function_oid
        and t.tgtype=expected.event_type and t.tgenabled='O' and t.tgisinternal
        and t.tgparentid=0 and not t.tgdeferrable and not t.tginitdeferred
        and t.tgnargs=0 and t.tgattr::text='' and t.tgargs=''::bytea
        and t.tgqual is null and t.tgoldtable is null and t.tgnewtable is null
        and (select count(*) from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_trigger'::pg_catalog.regclass and d.objid=t.oid)=1
        and exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_trigger'::pg_catalog.regclass and d.objid=t.oid and d.objsubid=0 and d.refclassid='pg_catalog.pg_constraint'::pg_catalog.regclass and d.refobjid=c.oid and d.refobjsubid=0 and d.deptype='i')
    )<>1)
  )) then
    raise exception 'R01 animal draft prerequisite FK trigger enforcement differs' using errcode='55000';
  end if;
  v_table := pg_catalog.to_regclass('public.animal_draft_image_upload_intent');
  if v_table is not null then
  select pg_catalog.jsonb_build_object(
    'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'collation',(select n.nspname||'.'||co.collname from pg_catalog.pg_collation co join pg_catalog.pg_namespace n on n.oid=co.collnamespace where co.oid=a.attcollation),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',case when a.attacl is null then '[]'::jsonb else null end,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=v_table and a.attnum>0 and not a.attisdropped),
    'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',con.conname,'type',con.contype,'validated',con.convalidated,'definition',pg_catalog.pg_get_constraintdef(con.oid,true)) order by con.conname) from pg_catalog.pg_constraint con where con.conrelid=v_table),
    'indexes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique) order by pg_catalog.pg_get_indexdef(i.indexrelid)) from pg_catalog.pg_index i where i.indrelid=v_table)
  ) into v_actual;
  if v_actual is distinct from $expected${"columns":[{"acl":[],"name":"storage_path","type":"text","default":null,"notNull":true,"identity":"","position":1,"collation":"pg_catalog.default","generated":""},{"acl":[],"name":"animal_id","type":"uuid","default":null,"notNull":true,"identity":"","position":2,"collation":null,"generated":""},{"acl":[],"name":"created_at","type":"timestamp with time zone","default":"clock_timestamp()","notNull":true,"identity":"","position":3,"collation":null,"generated":""},{"acl":[],"name":"expires_at","type":"timestamp with time zone","default":null,"notNull":true,"identity":"","position":4,"collation":null,"generated":""},{"acl":[],"name":"attached_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":5,"collation":null,"generated":""},{"acl":[],"name":"cleanup_claimed_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":6,"collation":null,"generated":""}],"constraints":[{"name":"animal_draft_image_upload_expiry","type":"c","validated":true,"definition":"CHECK (expires_at > created_at)"},{"name":"animal_draft_image_upload_intent_pkey","type":"p","validated":true,"definition":"PRIMARY KEY (storage_path)"},{"name":"animal_draft_image_upload_path","type":"c","validated":true,"definition":"CHECK (storage_path ~~ (animal_id::text || '/%'::text))"}],"indexes":[{"ready":true,"valid":true,"unique":false,"definition":"CREATE INDEX animal_draft_image_upload_cleanup_idx ON public.animal_draft_image_upload_intent USING btree (expires_at) WHERE (attached_at IS NULL)"},{"ready":true,"valid":true,"unique":true,"definition":"CREATE UNIQUE INDEX animal_draft_image_upload_intent_pkey ON public.animal_draft_image_upload_intent USING btree (storage_path)"}]}$expected$::jsonb
    or not exists(select 1 from pg_catalog.pg_class where oid=v_table and relkind='r' and relpersistence='p' and not relhasrules and not exists(select 1 from pg_catalog.pg_rewrite where ev_class=v_table) and relrowsecurity and not relforcerowsecurity and relowner='postgres'::pg_catalog.regrole and reloptions is null and relreplident='d')
    or exists(select 1 from pg_catalog.pg_policy where polrelid=v_table)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid=v_table and not tgisinternal)
    or exists(select 1 from pg_catalog.pg_constraint where conrelid=v_table and (condeferrable or condeferred)) then
    raise exception 'R01 animal draft intent definition differs: animal_draft_image_upload_intent' using errcode='55000';
  end if;
  select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) filter(where a.grantee='service_role'::pg_catalog.regrole) into v_acl
    from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table;
  -- Existing modern tables inherited eight nongrantable service privileges.
  -- Missing tables receive explicit CRUD only; preserve that reviewed profile.
  if not (v_acl is not distinct from array['DELETE','INSERT','SELECT','UPDATE']::text[]
      or (v_acl is not distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]))
    or (select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and a.grantee=t.relowner) is distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
    or exists(select 1 from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and (a.grantor<>t.relowner or a.is_grantable or a.grantee not in(t.relowner,'service_role'::pg_catalog.regrole)))
    or not (pg_catalog.has_table_privilege('service_role',v_table,'SELECT') and pg_catalog.has_table_privilege('service_role',v_table,'INSERT') and pg_catalog.has_table_privilege('service_role',v_table,'UPDATE') and pg_catalog.has_table_privilege('service_role',v_table,'DELETE'))
    or pg_catalog.has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_any_column_privilege('anon',v_table,'SELECT,INSERT,UPDATE,REFERENCES')
    or pg_catalog.has_any_column_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'R01 animal draft intent effective privileges differ' using errcode='55000';
  end if;

  end if;
  v_function := pg_catalog.to_regprocedure('public.set_animal_archived_with_audit(uuid,uuid,boolean)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='set_animal_archived_with_audit') <> (case when v_function is null then 0 else 1 end) then
    raise exception 'R01 animal function overload differs: set_animal_archived_with_audit' using errcode='55000';
  end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_actor_user_id uuid, p_animal_id uuid, p_archived boolean' and pg_catalog.pg_get_function_result(p.oid)='jsonb' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('1032db3be15fc3ea053c43648d45291d','24c511a72fdb32759907fbd2b0f71d73'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 animal function contract differs: set_animal_archived_with_audit' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.reserve_animal_draft_image_upload(uuid,text)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='reserve_animal_draft_image_upload') <> (case when v_function is null then 0 else 1 end) then
    raise exception 'R01 animal function overload differs: reserve_animal_draft_image_upload' using errcode='55000';
  end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_animal_id uuid, p_storage_path text' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('5658c0440a73a3712a7fa7a9d9b0a637'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 animal function contract differs: reserve_animal_draft_image_upload' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.mark_animal_draft_image_attached()');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='mark_animal_draft_image_attached') <> (case when v_function is null then 0 else 1 end) then
    raise exception 'R01 animal function overload differs: mark_animal_draft_image_attached' using errcode='55000';
  end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='' and pg_catalog.pg_get_function_result(p.oid)='trigger' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('af001f689c6f2649e666114cfefc3dd7'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 animal function contract differs: mark_animal_draft_image_attached' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.claim_expired_animal_draft_image_uploads(timestamptz,integer)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='claim_expired_animal_draft_image_uploads') <> (case when v_function is null then 0 else 1 end) then
    raise exception 'R01 animal function overload differs: claim_expired_animal_draft_image_uploads' using errcode='55000';
  end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=1000 and p.prosupport=0 and l.lanname='sql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_cutoff timestamp with time zone, p_limit integer' and pg_catalog.pg_get_function_result(p.oid)='TABLE(animal_id uuid, storage_path text, claimed_at timestamp with time zone)' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('ca2a09ef407124d7cb7dbe2e9f36cdf7'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 animal function contract differs: claim_expired_animal_draft_image_uploads' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('private.require_animal_archive_actor(uuid)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace='private'::pg_catalog.regnamespace and proname='require_animal_archive_actor') <> (case when v_function is null then 0 else 1 end) then
    raise exception 'R01 animal function overload differs: require_animal_archive_actor' using errcode='55000';
  end if;
  if v_function is not null and (
    not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_actor uuid' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) in ('5e3d7a6501a7dc851864ba6e09f8097c'))
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
  ) then raise exception 'R01 animal function contract differs: require_animal_archive_actor' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_trigger t where tgrelid=v_draft and tgname='animal_draft_image_attached' and (
    pg_catalog.pg_get_triggerdef(t.oid,true)<>'CREATE TRIGGER animal_draft_image_attached AFTER INSERT OR UPDATE OF body ON public.animal_draft FOR EACH ROW EXECUTE FUNCTION public.mark_animal_draft_image_attached()' or tgenabled<>'O' or tgisinternal or tgparentid<>0 or tgtype<>21 or tgconstraint<>0 or tgconstrrelid<>0 or tgconstrindid<>0 or tgdeferrable or tginitdeferred or tgnargs<>0 or tgargs<>''::bytea or tgqual is not null or tgoldtable is not null or tgnewtable is not null
  )) then raise exception 'R01 animal attachment trigger differs' using errcode='55000'; end if;

  -- All existing-object checks above completed before creation/replacement below.
  if v_table is null then
    create table public.animal_draft_image_upload_intent (
  storage_path text primary key,
  animal_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  attached_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint animal_draft_image_upload_path
    check (storage_path like animal_id::text || '/%'),
  constraint animal_draft_image_upload_expiry
    check (expires_at > created_at)
);
    alter table public.animal_draft_image_upload_intent enable row level security;
    revoke all on public.animal_draft_image_upload_intent from public,anon,authenticated,service_role;
    grant select,insert,update,delete on public.animal_draft_image_upload_intent to service_role;
    create index animal_draft_image_upload_cleanup_idx on public.animal_draft_image_upload_intent(expires_at) where attached_at is null;
  end if;
  if pg_catalog.to_regprocedure('public.set_animal_archived_with_audit(uuid,uuid,boolean)') is null or (select pg_catalog.md5(pg_catalog.pg_get_functiondef(oid)) from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.set_animal_archived_with_audit(uuid,uuid,boolean)'))='24c511a72fdb32759907fbd2b0f71d73' then
    execute $definition$CREATE OR REPLACE FUNCTION public.set_animal_archived_with_audit(p_actor_user_id uuid, p_animal_id uuid, p_archived boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_previous timestamptz;
  v_next timestamptz;
  v_now timestamptz;
begin
  if p_actor_user_id is null or p_animal_id is null or p_archived is null then
    raise exception 'invalid archive arguments' using errcode = '22023';
  end if;

  perform private.require_animal_archive_actor(p_actor_user_id);

  select a.retired_at into v_previous
  from public.animals a
  where a.id = p_animal_id
  for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  -- A retry must preserve the original retirement date and avoid a second audit.
  if (v_previous is not null) = p_archived then
    return jsonb_build_object(
      'kind', 'unchanged', 'id', p_animal_id, 'retired_at', v_previous
    );
  end if;

  v_now := clock_timestamp();
  v_next := case when p_archived then v_now else null end;
  update public.animals
  set retired_at = v_next, updated_at = v_now
  where id = p_animal_id;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, "timestamp", detail
  )
  values (
    p_actor_user_id, 'animals.update', 'animals', p_animal_id::text, v_now,
    jsonb_build_object(
      'changed',
      jsonb_build_object(
        'retired_at', jsonb_build_object('from', v_previous, 'to', v_next)
      )
    )
  );

  return jsonb_build_object(
    'kind', case when p_archived then 'archived' else 'restored' end,
    'id', p_animal_id,
    'retired_at', v_next
  );
end;
$function$
$definition$;
    -- Reviewed old function already has exact ACL; same explicit clamp also covers creation.
    revoke all on function public.set_animal_archived_with_audit(uuid,uuid,boolean) from public,anon,authenticated,service_role;
    grant execute on function public.set_animal_archived_with_audit(uuid,uuid,boolean) to service_role;
  end if;
  if pg_catalog.to_regprocedure('public.reserve_animal_draft_image_upload(uuid,text)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.reserve_animal_draft_image_upload(p_animal_id uuid, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_path text;
begin
  if p_animal_id is null or p_storage_path is null then
    raise exception 'invalid_animal_draft_upload_intent' using errcode = '22023';
  end if;

  insert into public.animal_draft_image_upload_intent (
    storage_path, animal_id, expires_at
  ) values (
    p_storage_path, p_animal_id, pg_catalog.clock_timestamp() + interval '1 day'
  )
  on conflict (storage_path) do update
  set expires_at = greatest(
    public.animal_draft_image_upload_intent.expires_at,
    excluded.expires_at
  )
  where public.animal_draft_image_upload_intent.animal_id = excluded.animal_id
    and public.animal_draft_image_upload_intent.cleanup_claimed_at is null
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'animal_draft_upload_cleanup_in_progress' using errcode = '55000';
  end if;
end;
$function$
$definition$;
    revoke all on function public.reserve_animal_draft_image_upload(uuid,text) from public,anon,authenticated,service_role;
    grant execute on function public.reserve_animal_draft_image_upload(uuid,text) to service_role;
  end if;
  if pg_catalog.to_regprocedure('public.mark_animal_draft_image_attached()') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.mark_animal_draft_image_attached()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_path text;
  v_claimed_at timestamptz;
begin
  for v_path in
    select distinct paths.path
    from (
      select nullif(new.body->>'draft_image_path', '') as path
      union all
      select nullif(photo->>'draft_path', '') as path
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(new.body->'gallery') = 'array'
          then new.body->'gallery'
          else '[]'::jsonb
        end
      ) as photo
    ) as paths
    where paths.path is not null
      and paths.path like new.id::text || '/%'
  loop
    select intent.cleanup_claimed_at into v_claimed_at
    from public.animal_draft_image_upload_intent as intent
    where intent.storage_path = v_path
      and intent.animal_id = new.id
    for update;

    if found then
      if v_claimed_at is not null then
        raise exception 'animal draft image is being cleaned up' using errcode = '55000';
      end if;
      update public.animal_draft_image_upload_intent
      set attached_at = pg_catalog.clock_timestamp()
      where storage_path = v_path;
    end if;
  end loop;
  return new;
end;
$function$
$definition$;
    revoke all on function public.mark_animal_draft_image_attached() from public,anon,authenticated,service_role;
    grant execute on function public.mark_animal_draft_image_attached() to service_role;
  end if;
  if pg_catalog.to_regprocedure('public.claim_expired_animal_draft_image_uploads(timestamptz,integer)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.claim_expired_animal_draft_image_uploads(p_cutoff timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(animal_id uuid, storage_path text, claimed_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  with candidates as (
    select intent.storage_path
    from public.animal_draft_image_upload_intent as intent
    where intent.attached_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at, intent.storage_path
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.animal_draft_image_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.storage_path = candidates.storage_path
  returning intent.animal_id, intent.storage_path, intent.cleanup_claimed_at;
$function$
$definition$;
    revoke all on function public.claim_expired_animal_draft_image_uploads(timestamptz,integer) from public,anon,authenticated,service_role;
    grant execute on function public.claim_expired_animal_draft_image_uploads(timestamptz,integer) to service_role;
  end if;
  if pg_catalog.to_regprocedure('private.require_animal_archive_actor(uuid)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION private.require_animal_archive_actor(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- SHARE fences non-key suspension changes while allowing concurrent reads.
  perform 1 from auth.users u
  where u.id=p_actor and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'Animal archive actor unavailable' using errcode='42501';
  end if;
  perform 1 from public.admin_user a
  where a.auth_user_id=p_actor and a.status='active' and a.role in ('staff','admin')
  for share;
  if not found then
    raise exception 'Animal archive actor unavailable' using errcode='42501';
  end if;
end;
$function$
$definition$;
    revoke all on function private.require_animal_archive_actor(uuid) from public,anon,authenticated,service_role;
    grant execute on function private.require_animal_archive_actor(uuid) to service_role;
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=v_draft and tgname='animal_draft_image_attached') then
    create trigger animal_draft_image_attached after insert or update of body on public.animal_draft for each row execute function public.mark_animal_draft_image_attached();
  end if;
end;
$migration$;
