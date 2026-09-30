-- T23 sponsorship follow-up assignment prerequisite. Payment/proof status is untouched.
-- The row version fences a staff preview against payment/status changes.
alter table public.sponsorship_pledge
  add column followup_assignee_user_id uuid references auth.users(id),
  add column followup_version bigint not null default 1;

create function private.bump_sponsorship_followup_version()
returns trigger language plpgsql set search_path='' as $$
begin
  new.followup_version := old.followup_version + 1;
  return new;
end $$;
revoke all on function private.bump_sponsorship_followup_version() from public,anon,authenticated;

create trigger sponsorship_pledge_followup_version_before_update
before update on public.sponsorship_pledge for each row
execute function private.bump_sponsorship_followup_version();

create index sponsorship_pledge_followup_assignee_idx
on public.sponsorship_pledge(followup_assignee_user_id,created_at)
where status='needs_followup';

create function public.assign_sponsorship_followup(
  p_actor uuid,
  p_pledge uuid,
  p_assignee uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_version bigint;
begin
  if p_actor is null or p_pledge is null or p_assignee is null
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Invalid follow-up assignment' using errcode='22023';
  end if;

  -- Shared row locks fence a concurrent role downgrade or Auth ban until commit.
  perform 1 from public.admin_user a
  join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_actor and a.status='active'
    and a.role in ('staff','admin')
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=now())
  for share of a,u;
  if not found then
    raise exception 'Follow-up actor unavailable' using errcode='42501';
  end if;
  perform 1 from public.admin_user a
  join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_assignee and a.status='active'
    and a.role in ('staff','admin')
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=now())
  for share of a,u;
  if not found then
    raise exception 'Follow-up assignee unavailable' using errcode='42501';
  end if;

  select * into v_pledge from public.sponsorship_pledge
  where id=p_pledge for update;
  if not found then
    raise exception 'Pledge unavailable' using errcode='P0002';
  end if;
  if v_pledge.status<>'needs_followup' then
    raise exception 'Follow-up preview stale' using errcode='40001';
  end if;
  if v_pledge.followup_assignee_user_id=p_assignee
     and v_pledge.followup_version=p_expected_version+1 then
    return jsonb_build_object(
      'pledgeId',p_pledge,'assigneeUserId',p_assignee,
      'version',v_pledge.followup_version,'replayed',true
    );
  end if;
  if v_pledge.followup_version<>p_expected_version then
    raise exception 'Follow-up preview stale' using errcode='40001';
  end if;

  update public.sponsorship_pledge
  set followup_assignee_user_id=p_assignee,updated_at=clock_timestamp()
  where id=p_pledge
  returning followup_version into v_version;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(
    p_actor,'sponsorship_pledge.assign_followup','sponsorship_pledge',p_pledge::text,
    jsonb_build_object(
      'beforeAssigneeUserId',v_pledge.followup_assignee_user_id,
      'afterAssigneeUserId',p_assignee,
      'expectedVersion',p_expected_version,
      'newVersion',v_version
    )
  );
  return jsonb_build_object(
    'pledgeId',p_pledge,'assigneeUserId',p_assignee,
    'version',v_version,'replayed',false
  );
end $$;
revoke all on function public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)
  to service_role;


-- The picker uses the same current Auth/role eligibility as the write command.
create function public.list_sponsorship_followup_assignees(p_actor uuid)
returns table("authUserId" uuid,email text,role text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_actor and a.status='active' and a.role in ('staff','admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())
  ) then
    raise exception 'Follow-up actor unavailable' using errcode='42501';
  end if;
  return query
    select a.auth_user_id,a.email::text,a.role::text
    from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.status='active' and a.role in ('staff','admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())
    order by a.email,a.auth_user_id
    limit 1000;
end $$;
revoke all on function public.list_sponsorship_followup_assignees(uuid) from public,anon,authenticated;
grant execute on function public.list_sponsorship_followup_assignees(uuid) to service_role;
