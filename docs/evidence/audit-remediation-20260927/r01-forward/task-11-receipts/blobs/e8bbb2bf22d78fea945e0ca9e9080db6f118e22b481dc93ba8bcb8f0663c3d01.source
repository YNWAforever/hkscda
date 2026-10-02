-- Keep status validity and closing semantics in the same transaction as the case mutation.
create or replace function public.change_adoption_case_status(
  p_case_id uuid,
  p_status_id uuid,
  p_actor_user_id uuid,
  p_note text,
  p_closed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.coordinator_status%rowtype;
begin
  perform 1
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin')
  for share;
  if not found then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  select * into v_status
  from public.coordinator_status
  where id = p_status_id
    and category = 'adoption_case'
    and is_active
  for share;
  if not found then
    raise exception 'Invalid or inactive adoption case status'
      using errcode = '22023';
  end if;

  update public.adoption_case
  set status_id = p_status_id,
      closed_at = case
        when v_status.is_closing then coalesce(p_closed_at, clock_timestamp())
        else null
      end
  where id = p_case_id;
  if not found then
    raise exception 'Adoption case not found' using errcode = 'P0002';
  end if;

  insert into public.coordinator_status_history (
    entity_type, entity_id, status_id, actor_user_id, note
  ) values (
    'adoption_case', p_case_id, p_status_id, p_actor_user_id, p_note
  );

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, detail
  ) values (
    p_actor_user_id,
    'adoption_case.status_change',
    'adoption_case',
    p_case_id::text,
    jsonb_build_object('statusId', p_status_id, 'note', p_note)
  );
end;
$$;

revoke all on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz)
  to service_role;
