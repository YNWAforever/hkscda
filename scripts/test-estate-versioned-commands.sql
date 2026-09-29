-- Run only inside a BEGIN/ROLLBACK wrapper against the exact isolated local DB.
do $$
declare
  actor_id uuid;
  estate_a uuid := gen_random_uuid();
  estate_b uuid := gen_random_uuid();
  result jsonb;
  audit_count integer;
  caught text;
begin
  select auth_user_id into actor_id from public.admin_user
  where status = 'active' and role in ('staff', 'admin') limit 1;
  if actor_id is null then raise exception 'Synthetic active actor unavailable'; end if;
  if (select version from public.dog_friendly_estates
      where id = 'f1111111-1111-4111-8111-111111111111'::uuid) <> 1 then
    raise exception 'Existing estate was not backfilled to version 1';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.dog_friendly_estates'::regclass) then
    raise exception 'Estate RLS disabled';
  end if;
  if has_function_privilege('anon',
      'public.mutate_dog_friendly_estate_with_audit(uuid,text,uuid,integer,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'public.mutate_dog_friendly_estate_with_audit(uuid,text,uuid,integer,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role',
      'public.mutate_dog_friendly_estate_with_audit(uuid,text,uuid,integer,jsonb)', 'EXECUTE') then
    raise exception 'Estate function grants incorrect';
  end if;

  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'create',estate_a,null,
    '{"estate_name":"Test A","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  if (result->>'version')::integer <> 1 or (result->>'is_published')::boolean then
    raise exception 'Create did not default to unpublished version 1';
  end if;
  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'create',estate_a,null,
    '{"estate_name":"Test A","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  select count(*) into audit_count from public.audit_log
  where entity='dog_friendly_estate' and entity_id=estate_a::text
    and action='dog_friendly_estate.create';
  if audit_count <> 1 then raise exception 'Create retry duplicated audit'; end if;
  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'create',estate_b,null,
    '{"estate_name":"Test B","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  if (select count(*) from public.dog_friendly_estates where id in (estate_a,estate_b)) <> 2 then
    raise exception 'Two create identities were not retained';
  end if;
  -- An old checkout can still write after the additive migration. Its
  -- existing audited RPC must bump version through the trigger.
  result := public.mutate_admin_content_with_audit(
    actor_id,'dog_friendly_estate','upsert',estate_b,
    '{"estate_name":"Test B legacy","district":"Kowloon","notes":null,"sort_order":0,"is_published":false}'::jsonb);
  if (result->>'version')::integer <> 2 then
    raise exception 'Legacy update did not bump estate version';
  end if;

  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'publication',estate_a,1,'{"is_published":true}'::jsonb);
  if (result->>'version')::integer <> 2 then raise exception 'Publish version incorrect'; end if;
  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'update',estate_a,2,
    '{"estate_name":"Test A edited","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  if (result->>'version')::integer <> 3 or not (result->>'is_published')::boolean then
    raise exception 'Content edit cleared publication or version incorrect';
  end if;
  begin
    perform public.mutate_dog_friendly_estate_with_audit(
      actor_id,'update',estate_a,2,
      '{"estate_name":"Stale overwrite","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
    raise exception 'Stale version unexpectedly accepted';
  exception when sqlstate 'P4090' then
    null;
  end;
  if (select estate_name from public.dog_friendly_estates where id=estate_a) <> 'Test A edited' then
    raise exception 'Stale write changed row';
  end if;
  result := public.mutate_dog_friendly_estate_with_audit(
    actor_id,'publication',estate_a,3,'{"is_published":false}'::jsonb);
  if (result->>'version')::integer <> 4 or (result->>'is_published')::boolean then
    raise exception 'Unpublish failed';
  end if;
  begin
    perform public.mutate_dog_friendly_estate_with_audit(
      gen_random_uuid(),'publication',estate_a,4,'{"is_published":true}'::jsonb);
    raise exception 'Unknown actor unexpectedly authorized';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into audit_count from public.audit_log
  where entity='dog_friendly_estate' and entity_id=estate_a::text;
  if audit_count <> 4 then raise exception 'Audit count should be create plus three mutations, got %',audit_count; end if;
  raise notice 'T12: two rows, idempotent retry, publication preservation, stale conflict, role guard, audit passed';
end;
$$;

create function public.t12_reject_estate_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'dog_friendly_estate.update'
     and new.detail->'payload'->>'estate_name' = 'Audit failure' then
    raise exception 'synthetic audit failure';
  end if;
  return new;
end;
$$;
create trigger t12_reject_estate_audit before insert on public.audit_log
for each row execute function public.t12_reject_estate_audit();

do $$
declare
  actor_id uuid;
  estate_id uuid := gen_random_uuid();
  caught boolean := false;
begin
  select auth_user_id into actor_id from public.admin_user
  where status='active' and role in ('staff','admin') limit 1;
  perform public.mutate_dog_friendly_estate_with_audit(
    actor_id,'create',estate_id,null,
    '{"estate_name":"Before failure","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  begin
    perform public.mutate_dog_friendly_estate_with_audit(
      actor_id,'update',estate_id,1,
      '{"estate_name":"Audit failure","district":"Kowloon","notes":null,"sort_order":0}'::jsonb);
  exception when others then
    caught := true;
  end;
  if not caught then raise exception 'Expected audit failure not raised'; end if;
  if (select estate_name from public.dog_friendly_estates where id=estate_id) <> 'Before failure'
     or (select version from public.dog_friendly_estates where id=estate_id) <> 1 then
    raise exception 'Audit failure did not roll back row update';
  end if;
  raise notice 'T12: audit failure rolled back row update';
end;
$$;
