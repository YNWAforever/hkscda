-- T23 volunteer identity: reviewer assignment only. No qualification or status mutation.
create table public.volunteer_profile_review_assignment (
  profile_id uuid primary key references public.volunteer_profile(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  version bigint not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.volunteer_review_bulk_operation (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  reviewer_user_id uuid not null references auth.users(id),
  filter_hash text not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes')
);
create table public.volunteer_review_bulk_item (
  operation_id uuid not null references public.volunteer_review_bulk_operation(id),
  profile_id uuid not null,
  ordinal integer not null,
  expected_profile_revision bigint,
  expected_assignment_version bigint,
  before_reviewer uuid,
  after_reviewer uuid,
  status text not null check (status in ('pending','succeeded','skipped','conflict','failed')),
  reason_code text,
  applied_at timestamptz,
  primary key(operation_id,profile_id),
  unique(operation_id,ordinal)
);
create index volunteer_review_bulk_operation_actor_idx on public.volunteer_review_bulk_operation(actor_user_id,created_at desc);
create index volunteer_review_bulk_item_pending_idx on public.volunteer_review_bulk_item(operation_id,ordinal) where status='pending';
alter table public.volunteer_profile_review_assignment enable row level security;
alter table public.volunteer_review_bulk_operation enable row level security;
alter table public.volunteer_review_bulk_item enable row level security;
revoke all on public.volunteer_profile_review_assignment, public.volunteer_review_bulk_operation, public.volunteer_review_bulk_item from public,anon,authenticated,service_role;
grant select on public.volunteer_profile_review_assignment, public.volunteer_review_bulk_operation, public.volunteer_review_bulk_item to service_role;

create function private.require_volunteer_review_bulk_actor(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_actor and a.status='active' and a.role='admin'
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  for share of a,u;
  if not found then raise exception 'Volunteer review actor unavailable' using errcode='42501'; end if;
end $$;
revoke all on function private.require_volunteer_review_bulk_actor(uuid) from public,anon,authenticated,service_role;
grant execute on function private.require_volunteer_review_bulk_actor(uuid) to service_role;

create function private.require_volunteer_review_reviewer(p_reviewer uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_reviewer and a.status='active' and a.role in ('staff','admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  for share of a,u;
  if not found then raise exception 'Volunteer reviewer unavailable' using errcode='42501'; end if;
end $$;
revoke all on function private.require_volunteer_review_reviewer(uuid) from public,anon,authenticated,service_role;
grant execute on function private.require_volunteer_review_reviewer(uuid) to service_role;

create function public.get_volunteer_review_bulk_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.volunteer_review_bulk_operation%rowtype;v_items jsonb;v_pending integer;v_succeeded integer;
begin
  perform private.require_volunteer_review_bulk_actor(p_actor);
  select * into v_op from public.volunteer_review_bulk_operation where id=p_operation and actor_user_id=p_actor;
  if not found then raise exception 'Volunteer review operation unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityId',i.profile_id,'status',i.status,'reasonCode',i.reason_code,
    'beforeReviewer',i.before_reviewer,'afterReviewer',i.after_reviewer,
    'expectedProfileRevision',i.expected_profile_revision,'expectedAssignmentVersion',i.expected_assignment_version
  ) order by i.ordinal),'[]'::jsonb),
    count(*) filter(where i.status='pending'),count(*) filter(where i.status='succeeded')
  into v_items,v_pending,v_succeeded
  from public.volunteer_review_bulk_item i where i.operation_id=p_operation;
  return jsonb_build_object(
    'operationId',v_op.id,'reviewerUserId',v_op.reviewer_user_id,
    'filterHash',v_op.filter_hash,'createdAt',v_op.created_at,'expiresAt',v_op.expires_at,
    'state',case when v_pending=0 then 'done' when v_succeeded=0 then 'queued' else 'partial' end,
    'items',v_items
  );
end $$;
revoke all on function public.get_volunteer_review_bulk_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_volunteer_review_bulk_operation(uuid,uuid) to service_role;

create function public.create_volunteer_review_bulk_preview(
  p_actor uuid,p_ids uuid[],p_reviewer uuid,p_filter_hash text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op uuid;v_id uuid;v_profile public.volunteer_profile%rowtype;
  v_assignment public.volunteer_profile_review_assignment%rowtype;
  v_status text;v_reason text;v_ordinal integer:=0;
begin
  perform private.require_volunteer_review_bulk_actor(p_actor);
  perform private.require_volunteer_review_reviewer(p_reviewer);
  if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>1000
     or exists(select 1 from unnest(p_ids) id where id is null)
     or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids)
     or coalesce(p_filter_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid volunteer review preview' using errcode='22023';
  end if;
  insert into public.volunteer_review_bulk_operation(actor_user_id,reviewer_user_id,filter_hash)
  values(p_actor,p_reviewer,p_filter_hash) returning id into v_op;
  foreach v_id in array p_ids loop
    v_ordinal:=v_ordinal+1;
    select * into v_profile from public.volunteer_profile where id=v_id;
    select * into v_assignment from public.volunteer_profile_review_assignment where profile_id=v_id;
    if v_profile.id is null then v_status:='skipped';v_reason:='not_found';
    elsif v_profile.status='suspended' then v_status:='skipped';v_reason:='suspended';
    elsif v_assignment.reviewer_user_id=p_reviewer then v_status:='skipped';v_reason:='already_assigned';
    else v_status:='pending';v_reason:=null;
    end if;
    insert into public.volunteer_review_bulk_item(
      operation_id,profile_id,ordinal,expected_profile_revision,expected_assignment_version,
      before_reviewer,after_reviewer,status,reason_code
    ) values(
      v_op,v_id,v_ordinal,v_profile.revision,coalesce(v_assignment.version,0),
      v_assignment.reviewer_user_id,
      case when v_status='pending' then p_reviewer else v_assignment.reviewer_user_id end,
      v_status,v_reason
    );
  end loop;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'volunteer_review_bulk.preview','volunteer_review_bulk_operation',v_op::text,
    jsonb_build_object('reviewerUserId',p_reviewer,'filterHash',p_filter_hash,'selectionCount',cardinality(p_ids)));
  return public.get_volunteer_review_bulk_operation(p_actor,v_op);
end $$;
revoke all on function public.create_volunteer_review_bulk_preview(uuid,uuid[],uuid,text) from public,anon,authenticated;
grant execute on function public.create_volunteer_review_bulk_preview(uuid,uuid[],uuid,text) to service_role;

create function public.apply_volunteer_review_bulk_item(
  p_actor uuid,p_operation uuid,p_profile uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op public.volunteer_review_bulk_operation%rowtype;
  v_item public.volunteer_review_bulk_item%rowtype;
  v_profile public.volunteer_profile%rowtype;
  v_assignment public.volunteer_profile_review_assignment%rowtype;
  v_status text;v_reason text;v_written integer;
begin
  perform private.require_volunteer_review_bulk_actor(p_actor);
  select * into v_op from public.volunteer_review_bulk_operation
  where id=p_operation and actor_user_id=p_actor for update;
  if not found then raise exception 'Volunteer review operation unavailable' using errcode='42501';end if;
  perform private.require_volunteer_review_reviewer(v_op.reviewer_user_id);
  if v_op.expires_at<=now() then raise exception 'Volunteer review preview expired' using errcode='P0001';end if;
  select * into v_item from public.volunteer_review_bulk_item
  where operation_id=p_operation and profile_id=p_profile for update;
  if not found then raise exception 'Volunteer review item unavailable' using errcode='42501';end if;
  if v_item.status<>'pending' then
    return jsonb_build_object('entityId',p_profile,'status',v_item.status,'reasonCode',v_item.reason_code);
  end if;
  select * into v_profile from public.volunteer_profile where id=p_profile for update;
  select * into v_assignment from public.volunteer_profile_review_assignment where profile_id=p_profile for update;
  if v_profile.id is null or v_profile.status='suspended' then
    v_status:='skipped';v_reason:='unavailable';
  elsif v_profile.revision<>v_item.expected_profile_revision
     or coalesce(v_assignment.version,0)<>v_item.expected_assignment_version
     or v_assignment.reviewer_user_id is distinct from v_item.before_reviewer then
    v_status:='conflict';v_reason:='version_changed';
  else
    if v_assignment.profile_id is null then
      insert into public.volunteer_profile_review_assignment(profile_id,reviewer_user_id,updated_by)
      values(p_profile,v_op.reviewer_user_id,p_actor) on conflict do nothing;
    else
      update public.volunteer_profile_review_assignment
      set reviewer_user_id=v_op.reviewer_user_id,version=version+1,
          updated_by=p_actor,updated_at=clock_timestamp()
      where profile_id=p_profile and version=v_item.expected_assignment_version;
    end if;
    get diagnostics v_written=row_count;
    if v_written=0 then v_status:='conflict';v_reason:='version_changed';
    else
      insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
      values(p_actor,'volunteer_profile.bulk_assign_reviewer','volunteer_profile',p_profile::text,
        jsonb_build_object('operationId',p_operation,'beforeReviewer',v_item.before_reviewer,
                           'afterReviewer',v_op.reviewer_user_id,'profileRevision',v_profile.revision));
      v_status:='succeeded';v_reason:=null;
    end if;
  end if;
  update public.volunteer_review_bulk_item
  set status=v_status,reason_code=v_reason,applied_at=clock_timestamp()
  where operation_id=p_operation and profile_id=p_profile;
  if v_status<>'succeeded' then
    insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor,'volunteer_review_bulk.item_result','volunteer_review_bulk_item',p_profile::text,
      jsonb_build_object('operationId',p_operation,'status',v_status,'reasonCode',v_reason));
  end if;
  return jsonb_build_object('entityId',p_profile,'status',v_status,'reasonCode',v_reason);
end $$;
revoke all on function public.apply_volunteer_review_bulk_item(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_volunteer_review_bulk_item(uuid,uuid,uuid) to service_role;
