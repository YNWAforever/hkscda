-- T23 sponsorship bulk follow-up assignment only. No payment, proof, or notification mutation.
create table public.sponsorship_followup_bulk_operation (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  assignee_user_id uuid not null references auth.users(id),
  filter_hash text not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes')
);
create table public.sponsorship_followup_bulk_item (
  operation_id uuid not null references public.sponsorship_followup_bulk_operation(id),
  pledge_id uuid not null,
  ordinal integer not null,
  expected_version bigint,
  before_assignee uuid,
  after_assignee uuid,
  status text not null check (status in ('pending','succeeded','skipped','conflict','failed')),
  reason_code text,
  applied_at timestamptz,
  primary key(operation_id,pledge_id),
  unique(operation_id,ordinal)
);
create index sponsorship_followup_bulk_operation_actor_idx on public.sponsorship_followup_bulk_operation(actor_user_id,created_at desc);
create index sponsorship_followup_bulk_item_pending_idx on public.sponsorship_followup_bulk_item(operation_id,ordinal) where status='pending';
alter table public.sponsorship_followup_bulk_operation enable row level security;
alter table public.sponsorship_followup_bulk_item enable row level security;
revoke all on public.sponsorship_followup_bulk_operation,public.sponsorship_followup_bulk_item from public,anon,authenticated,service_role;
grant select on public.sponsorship_followup_bulk_operation,public.sponsorship_followup_bulk_item to service_role;

create function private.require_sponsorship_followup_bulk_user(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_user and a.status='active' and a.role in ('staff','admin')
    and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
  for share of a,u;
  if not found then raise exception 'Follow-up bulk user unavailable' using errcode='42501'; end if;
end $$;
revoke all on function private.require_sponsorship_followup_bulk_user(uuid) from public,anon,authenticated,service_role;

create function public.get_sponsorship_followup_bulk_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.sponsorship_followup_bulk_operation%rowtype;v_items jsonb;v_pending integer;v_succeeded integer;
begin
  perform private.require_sponsorship_followup_bulk_user(p_actor);
  select * into v_op from public.sponsorship_followup_bulk_operation where id=p_operation and actor_user_id=p_actor;
  if not found then raise exception 'Follow-up bulk operation unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityId',i.pledge_id,'status',i.status,'reasonCode',i.reason_code,
    'beforeAssignee',i.before_assignee,'afterAssignee',i.after_assignee,
    'expectedVersion',i.expected_version
  ) order by i.ordinal),'[]'::jsonb),
  count(*) filter(where i.status='pending'),count(*) filter(where i.status='succeeded')
  into v_items,v_pending,v_succeeded
  from public.sponsorship_followup_bulk_item i where i.operation_id=p_operation;
  return jsonb_build_object(
    'operationId',v_op.id,'assigneeUserId',v_op.assignee_user_id,'filterHash',v_op.filter_hash,
    'createdAt',v_op.created_at,'expiresAt',v_op.expires_at,
    'state',case when v_pending=0 then 'done' when v_succeeded=0 then 'queued' else 'partial' end,
    'items',v_items
  );
end $$;
revoke all on function public.get_sponsorship_followup_bulk_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_sponsorship_followup_bulk_operation(uuid,uuid) to service_role;

create function public.create_sponsorship_followup_bulk_preview(p_actor uuid,p_ids uuid[],p_assignee uuid,p_filter_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op uuid;v_id uuid;v_pledge public.sponsorship_pledge%rowtype;v_status text;v_reason text;v_ordinal integer:=0;
begin
  perform private.require_sponsorship_followup_bulk_user(p_actor);
  perform private.require_sponsorship_followup_bulk_user(p_assignee);
  if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>1000
    or exists(select 1 from unnest(p_ids) id where id is null)
    or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids)
    or coalesce(p_filter_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid follow-up bulk preview' using errcode='22023'; end if;
  insert into public.sponsorship_followup_bulk_operation(actor_user_id,assignee_user_id,filter_hash)
  values(p_actor,p_assignee,p_filter_hash) returning id into v_op;
  foreach v_id in array p_ids loop
    v_ordinal:=v_ordinal+1;
    select * into v_pledge from public.sponsorship_pledge where id=v_id;
    if v_pledge.id is null then v_status:='skipped';v_reason:='not_found';
    elsif v_pledge.status<>'needs_followup' then v_status:='skipped';v_reason:='status_changed';
    elsif v_pledge.followup_assignee_user_id=p_assignee then v_status:='skipped';v_reason:='already_assigned';
    else v_status:='pending';v_reason:=null;
    end if;
    insert into public.sponsorship_followup_bulk_item(
      operation_id,pledge_id,ordinal,expected_version,before_assignee,after_assignee,status,reason_code
    ) values(v_op,v_id,v_ordinal,v_pledge.followup_version,v_pledge.followup_assignee_user_id,
      case when v_status='pending' then p_assignee else v_pledge.followup_assignee_user_id end,v_status,v_reason);
  end loop;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'sponsorship_followup_bulk.preview','sponsorship_followup_bulk_operation',v_op::text,
    jsonb_build_object('assigneeUserId',p_assignee,'filterHash',p_filter_hash,'selectionCount',cardinality(p_ids)));
  return public.get_sponsorship_followup_bulk_operation(p_actor,v_op);
end $$;
revoke all on function public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text) from public,anon,authenticated;
grant execute on function public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text) to service_role;

create function public.apply_sponsorship_followup_bulk_item(p_actor uuid,p_operation uuid,p_pledge uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op public.sponsorship_followup_bulk_operation%rowtype;
  v_item public.sponsorship_followup_bulk_item%rowtype;
  v_pledge public.sponsorship_pledge%rowtype;
  v_status text;v_reason text;
begin
  perform private.require_sponsorship_followup_bulk_user(p_actor);
  select * into v_op from public.sponsorship_followup_bulk_operation
  where id=p_operation and actor_user_id=p_actor for update;
  if not found then raise exception 'Follow-up bulk operation unavailable' using errcode='42501'; end if;
  perform private.require_sponsorship_followup_bulk_user(v_op.assignee_user_id);
  if v_op.expires_at<=now() then raise exception 'Follow-up bulk preview expired' using errcode='P0001'; end if;
  select * into v_item from public.sponsorship_followup_bulk_item
  where operation_id=p_operation and pledge_id=p_pledge for update;
  if not found then raise exception 'Follow-up bulk item unavailable' using errcode='42501'; end if;
  if v_item.status<>'pending' then
    return jsonb_build_object('entityId',p_pledge,'status',v_item.status,'reasonCode',v_item.reason_code);
  end if;
  select * into v_pledge from public.sponsorship_pledge where id=p_pledge for update;
  if v_pledge.id is null then v_status:='skipped';v_reason:='not_found';
  elsif v_pledge.status<>'needs_followup' then v_status:='conflict';v_reason:='status_changed';
  elsif v_pledge.followup_version is distinct from v_item.expected_version
    or v_pledge.followup_assignee_user_id is distinct from v_item.before_assignee
  then v_status:='conflict';v_reason:='version_changed';
  else
    perform public.assign_sponsorship_followup(p_actor,p_pledge,v_op.assignee_user_id,v_item.expected_version);
    v_status:='succeeded';v_reason:=null;
  end if;
  update public.sponsorship_followup_bulk_item
  set status=v_status,reason_code=v_reason,applied_at=clock_timestamp()
  where operation_id=p_operation and pledge_id=p_pledge;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'sponsorship_followup_bulk.item_result','sponsorship_followup_bulk_item',p_pledge::text,
    jsonb_build_object('operationId',p_operation,'status',v_status,'reasonCode',v_reason));
  return jsonb_build_object('entityId',p_pledge,'status',v_status,'reasonCode',v_reason);
end $$;
revoke all on function public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid) to service_role;
