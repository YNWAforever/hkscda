-- BUG-03: "New supporter" with an email that already exists overwrote that supporter.
--
-- The create branch of mutate_crm_supporter_with_audit was an upsert on email: name,
-- phone (to null), language, tags (to []) and source were replaced, a soft-deleted
-- supporter was restored, every role was replaced with the new form's roles, and the
-- edit-version check was skipped. The audit detail held only the new values, so the old
-- ones could not be recovered.
--
-- Create now inserts only. On an email that already exists it:
--   * returns the existing supporter unchanged when the request is an exact retry of the
--     create that made it (same name, phone, language, tags, source and roles, and not
--     deleted) - create has always been safe to retry after a lost response, and the
--     database tests rely on that;
--   * otherwise raises supporter_exists (errcode P4091, the existing id in DETAIL), which
--     the CRM API answers with 409 so staff open the existing record instead.
-- Nothing is overwritten, restored or stripped of roles. The update branch, role and
-- audit handling are unchanged, as are the signature, security invoker, the empty
-- search_path (every reference stays schema-qualified) and the grants.

create or replace function public.mutate_crm_supporter_with_audit(
  p_operation text,
  p_supporter_id uuid,
  p_input jsonb,
  p_roles jsonb,
  p_actor_user_id uuid,
  p_at timestamp with time zone,
  p_detail jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_supporter public.supporter;
  v_existing public.supporter;
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
    on conflict (email) do nothing
    returning * into v_supporter;

    if not found then
      -- lower() on text matches citext's case-insensitive equality without resolving a
      -- citext operator under the empty search_path.
      select * into v_existing
      from public.supporter
      where pg_catalog.lower(email::text) = pg_catalog.lower(p_input->>'email')
      for update;

      if v_existing.deleted_at is null
        and v_existing.name is not distinct from p_input->>'name'
        and v_existing.phone is not distinct from p_input->>'phone'
        and v_existing.language is not distinct from p_input->>'language'
        and v_existing.tags is not distinct from
          array(select jsonb_array_elements_text(p_input->'tags'))
        and v_existing.source is not distinct from p_input->>'source'
        and (
          select coalesce(pg_catalog.array_agg(r.role order by r.role), '{}'::text[])
          from public.supporter_role r
          where r.supporter_id = v_existing.id
        ) = (
          select coalesce(pg_catalog.array_agg(x.role order by x.role), '{}'::text[])
          from (select distinct jsonb_array_elements_text(p_roles) as role) x
        )
      then
        -- An exact retry of the create that made this supporter: same answer, no writes.
        return jsonb_build_object('id', v_existing.id, 'email', v_existing.email);
      end if;

      raise exception 'supporter_exists'
        using errcode = 'P4091', detail = v_existing.id::text;
    end if;
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
$function$;

-- Unchanged from 20261001213914: service_role only.
revoke all on function public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)
  to service_role;
