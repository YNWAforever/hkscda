\set ON_ERROR_STOP on
begin;
do $$
declare v_name text; v_signature regprocedure; v_role text;
begin
  if not (select relrowsecurity from pg_class where oid='private.supporter_recovery_challenge'::regclass) then
    raise exception 'Recovery table must use RLS';
  end if;
  for v_role in select unnest(array['anon','authenticated','service_role']) loop
    if has_table_privilege(v_role,'private.supporter_recovery_challenge','SELECT')
      or has_table_privilege(v_role,'private.supporter_recovery_challenge','INSERT')
      or has_table_privilege(v_role,'private.supporter_recovery_challenge','UPDATE')
      or has_table_privilege(v_role,'private.supporter_recovery_challenge','DELETE') then
      raise exception 'Direct recovery table access forbidden: %',v_role;
    end if;
  end loop;
  for v_name,v_signature in select name,signature::regprocedure from (values
    ('create_supporter_recovery_challenge','public.create_supporter_recovery_challenge(uuid,uuid,text,text,text)'),
    ('consume_supporter_recovery_challenge','public.consume_supporter_recovery_challenge(uuid,text,text)'),
    ('invalidate_supporter_recovery_challenge','public.invalidate_supporter_recovery_challenge(uuid)')
  ) as wanted(name,signature) loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name) <> 1 then
      raise exception 'Unexpected overload for %',v_name;
    end if;
    if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=v_signature) then
      raise exception 'Recovery RPC must pin empty search_path: %',v_name;
    end if;
    if not has_function_privilege('service_role',v_signature,'EXECUTE') then raise exception 'Service RPC grant missing'; end if;
    if has_function_privilege('anon',v_signature,'EXECUTE') or has_function_privilege('authenticated',v_signature,'EXECUTE') then
      raise exception 'Recovery RPC exposed to browser roles';
    end if;
    if exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) acl where p.oid=v_signature and acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'Recovery RPC exposed to PUBLIC';
    end if;
  end loop;
  if (select count(*) from pg_policy where polrelid='private.supporter_recovery_challenge'::regclass) <> 0 then
    raise exception 'Recovery challenge has an unexpected public policy';
  end if;
end;
$$;
rollback;
