-- Separate R01 Task 3 dependency: each trigger row type has one animal-ID field.
-- Preserve eligibility/status/locking logic and all owner/config/ACL/attachments.
-- Only the exact reviewed bad definition or this exact repaired definition is accepted.
set local search_path = '';
do $migration$
declare v_function oid; v_hash text; v_acl jsonb; v_attachments jsonb;
begin
  if current_user <> 'postgres' then raise exception 'R01 preference requires postgres owner context' using errcode='55000'; end if;
  v_function := pg_catalog.to_regprocedure('public.enforce_current_animal_preference()');
  if v_function is null or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_current_animal_preference') <> 1 then
    raise exception 'R01 preference requires the exact existing trigger function' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and l.lanname='plpgsql' and p.prokind='f' and p.pronargs=0 and p.pronargdefaults=0 and p.proargnames is null and p.proargmodes is null and p.prorettype='pg_catalog.trigger'::pg_catalog.regtype and p.prosecdef and not p.proisstrict and not p.proleakproof and p.provolatile='v' and p.proparallel='u' and p.proconfig=array['search_path=public, pg_temp']) then
    raise exception 'R01 preference function identity/config differs' using errcode='55000';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,'grantor',pg_catalog.pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::pg_catalog.regrole::text) into v_acl from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function;
  if v_acl is distinct from '[{"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE","grantable":false},{"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE","grantable":false}]'::jsonb then
    raise exception 'R01 preference function ACL differs' using errcode='55000';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',n.nspname||'.'||c.relname,'name',t.tgname,'type',t.tgtype,'enabled',t.tgenabled,'internal',t.tgisinternal,'definition',pg_catalog.pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname) into v_attachments from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where t.tgfoid=v_function;
  if v_attachments is distinct from '[{"table":"public.adoption_application_animal_preference","name":"enforce_current_adoption_animal","type":7,"enabled":"O","internal":false,"definition":"CREATE TRIGGER enforce_current_adoption_animal BEFORE INSERT ON public.adoption_application_animal_preference FOR EACH ROW EXECUTE FUNCTION public.enforce_current_animal_preference()"},{"table":"public.sponsorship_preference","name":"enforce_current_sponsorship_animal","type":7,"enabled":"O","internal":false,"definition":"CREATE TRIGGER enforce_current_sponsorship_animal BEFORE INSERT ON public.sponsorship_preference FOR EACH ROW EXECUTE FUNCTION public.enforce_current_animal_preference()"}]'::jsonb then
    raise exception 'R01 preference trigger attachments differ' using errcode='55000';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.pg_get_functiondef(v_function));
  if v_hash not in ('5d9512de7da0c787523292316c6603e7','35e278e91a05873c5da7949cf4782b7a') then raise exception 'R01 preference definition differs' using errcode='55000'; end if;
  if v_hash='5d9512de7da0c787523292316c6603e7' then
    execute 'CREATE OR REPLACE FUNCTION public.enforce_current_animal_preference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare a public.animals%rowtype;
begin
 if tg_table_name=''sponsorship_preference'' then
  select * into a from public.animals where id=new.sponsor_animal_id for key share;
 else
  select * into a from public.animals where id=new.animal_id for key share;
 end if;
 if not found or a.retired_at is not null or a.publication_state<>''published'' or a.status not in(''available'',''fostered'') then raise exception ''animal_not_currently_public'' using errcode=''23514''; end if;
 if tg_table_name=''sponsorship_preference'' then
  if not a.sponsorship_eligible or new.animal_type_snapshot<>a.type then raise exception ''animal_not_sponsorship_eligible'' using errcode=''23514''; end if;
 else
  if not a.adoption_eligible or a.type not in(''cat'',''dog'') or new.animal_type_snapshot<>a.type then raise exception ''animal_not_adoption_eligible'' using errcode=''23514''; end if;
 end if;
 return new;
end $function$
';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(v_function)) <> '35e278e91a05873c5da7949cf4782b7a' then raise exception 'R01 preference repaired definition differs' using errcode='55000'; end if;
end
$migration$;
