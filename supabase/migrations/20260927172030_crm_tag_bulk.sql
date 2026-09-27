-- T23 CRM tag bulk. Only additive tags; never changes identity, roles or consent.
create table public.crm_tag_bulk_operation (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null default 'add_tag' check (action = 'add_tag'),
  filter_hash text not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  tag text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
create table public.crm_tag_bulk_item (
  operation_id uuid not null references public.crm_tag_bulk_operation(id),
  supporter_id uuid not null,
  ordinal integer not null,
  expected_version bigint,
  before_tags text[] not null default '{}',
  after_tags text[] not null default '{}',
  status text not null check (status in ('pending','succeeded','skipped','conflict','failed')),
  reason_code text,
  applied_at timestamptz,
  primary key (operation_id, supporter_id),
  unique (operation_id, ordinal)
);
create index crm_tag_bulk_operation_actor_created_idx
  on public.crm_tag_bulk_operation(actor_user_id,created_at desc);
create index crm_tag_bulk_item_pending_idx
  on public.crm_tag_bulk_item(operation_id,ordinal) where status='pending';
alter table public.crm_tag_bulk_operation enable row level security;
alter table public.crm_tag_bulk_item enable row level security;
revoke all on public.crm_tag_bulk_operation, public.crm_tag_bulk_item from public,anon,authenticated,service_role;
grant select on public.crm_tag_bulk_operation, public.crm_tag_bulk_item to service_role;

create function private.require_crm_tag_bulk_actor(p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.admin_user a
    join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_actor and a.status='active'
      and a.role in ('treasurer','admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'CRM bulk actor unavailable' using errcode='42501';
  end if;
end $$;
revoke all on function private.require_crm_tag_bulk_actor(uuid) from public,anon,authenticated,service_role;
grant execute on function private.require_crm_tag_bulk_actor(uuid) to service_role;

create function public.get_crm_tag_bulk_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_op public.crm_tag_bulk_operation%rowtype;
  v_items jsonb;
  v_pending integer;
  v_succeeded integer;
begin
  perform private.require_crm_tag_bulk_actor(p_actor);
  select * into v_op from public.crm_tag_bulk_operation
  where id=p_operation and actor_user_id=p_actor;
  if not found then
    raise exception 'Bulk operation unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityId',i.supporter_id,'status',i.status,'reasonCode',i.reason_code,
    'expectedVersion',i.expected_version,'beforeTags',i.before_tags,'afterTags',i.after_tags
  ) order by i.ordinal),'[]'::jsonb),
    count(*) filter (where i.status='pending'),
    count(*) filter (where i.status='succeeded')
  into v_items,v_pending,v_succeeded
  from public.crm_tag_bulk_item i where i.operation_id=p_operation;
  return jsonb_build_object(
    'operationId',v_op.id,'tag',v_op.tag,'filterHash',v_op.filter_hash,
    'createdAt',v_op.created_at,'expiresAt',v_op.expires_at,
    'state',case when v_pending=0 then 'done'
                 when v_succeeded=0 then 'queued'
                 else 'partial' end,
    'items',v_items
  );
end $$;
revoke all on function public.get_crm_tag_bulk_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_crm_tag_bulk_operation(uuid,uuid) to service_role;

create function public.create_crm_tag_bulk_preview(
  p_actor uuid,p_ids uuid[],p_tag text,p_filter_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_op uuid;
  v_id uuid;
  v_row public.supporter%rowtype;
  v_tag text:=btrim(coalesce(p_tag,''));
  v_status text;
  v_reason text;
  v_ordinal integer:=0;
begin
  perform private.require_crm_tag_bulk_actor(p_actor);
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 1000
     or exists(select 1 from unnest(p_ids) id where id is null)
     or (select count(distinct id) from unnest(p_ids) id) <> cardinality(p_ids)
     or char_length(v_tag) < 1 or char_length(v_tag) > 40
     or v_tag ~ '[[:cntrl:]]'
     or coalesce(p_filter_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid CRM bulk preview' using errcode='22023';
  end if;
  insert into public.crm_tag_bulk_operation(actor_user_id,filter_hash,tag)
  values(p_actor,p_filter_hash,v_tag) returning id into v_op;
  foreach v_id in array p_ids loop
    v_ordinal:=v_ordinal+1;
    select * into v_row from public.supporter where id=v_id;
    if not found then
      v_status:='skipped';v_reason:='not_found';
    elsif v_row.deleted_at is not null then
      v_status:='skipped';v_reason:='deleted';
    elsif v_tag=any(v_row.tags) then
      v_status:='skipped';v_reason:='already_tagged';
    else
      v_status:='pending';v_reason:=null;
    end if;
    insert into public.crm_tag_bulk_item(
      operation_id,supporter_id,ordinal,expected_version,before_tags,after_tags,status,reason_code
    ) values(
      v_op,v_id,v_ordinal,case when v_status='pending' then v_row.edit_version else null end,
      coalesce(v_row.tags,'{}'::text[]),
      case when v_status='pending' then array_append(v_row.tags,v_tag) else coalesce(v_row.tags,'{}'::text[]) end,
      v_status,v_reason
    );
  end loop;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'crm_tag_bulk.preview','crm_tag_bulk_operation',v_op::text,
    jsonb_build_object('tag',v_tag,'filterHash',p_filter_hash,'selectionCount',cardinality(p_ids)));
  return public.get_crm_tag_bulk_operation(p_actor,v_op);
end $$;
revoke all on function public.create_crm_tag_bulk_preview(uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.create_crm_tag_bulk_preview(uuid,uuid[],text,text) to service_role;

create function public.apply_crm_tag_bulk_item(
  p_actor uuid,p_operation uuid,p_supporter uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_op public.crm_tag_bulk_operation%rowtype;
  v_item public.crm_tag_bulk_item%rowtype;
  v_row public.supporter%rowtype;
  v_status text;
  v_reason text;
begin
  perform private.require_crm_tag_bulk_actor(p_actor);
  select * into v_op from public.crm_tag_bulk_operation
  where id=p_operation and actor_user_id=p_actor for update;
  if not found then raise exception 'Bulk operation unavailable' using errcode='42501';end if;
  if v_op.expires_at <= now() then
    raise exception 'Bulk snapshot expired' using errcode='P0001';
  end if;
  select * into v_item from public.crm_tag_bulk_item
  where operation_id=p_operation and supporter_id=p_supporter for update;
  if not found then raise exception 'Bulk item unavailable' using errcode='42501';end if;
  if v_item.status <> 'pending' then
    return jsonb_build_object('entityId',p_supporter,'status',v_item.status,'reasonCode',v_item.reason_code);
  end if;
  select * into v_row from public.supporter where id=p_supporter for update;
  if not found or v_row.deleted_at is not null then
    v_status:='skipped';v_reason:='unavailable';
  elsif v_row.edit_version <> v_item.expected_version
     or v_row.tags is distinct from v_item.before_tags then
    v_status:='conflict';v_reason:='version_changed';
  else
    update public.supporter set tags=v_item.after_tags where id=p_supporter;
    insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor,'supporter.bulk_tag_add','supporter',p_supporter::text,
      jsonb_build_object('operationId',p_operation,'tag',v_op.tag,
                         'beforeTags',v_item.before_tags,'afterTags',v_item.after_tags));
    v_status:='succeeded';v_reason:=null;
  end if;
  update public.crm_tag_bulk_item set status=v_status,reason_code=v_reason,
    applied_at=clock_timestamp()
  where operation_id=p_operation and supporter_id=p_supporter;
  if v_status <> 'succeeded' then
    insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor,'crm_tag_bulk.item_result','crm_tag_bulk_item',p_supporter::text,
      jsonb_build_object('operationId',p_operation,'status',v_status,'reasonCode',v_reason));
  end if;
  return jsonb_build_object('entityId',p_supporter,'status',v_status,'reasonCode',v_reason);
end $$;
revoke all on function public.apply_crm_tag_bulk_item(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_crm_tag_bulk_item(uuid,uuid,uuid) to service_role;
