-- T23 animal content: batch-send unpublished, unclassified drafts to existing editorial review.
-- No publication-state, photo, or animal-match mutation.
create table public.animal_review_bulk_operation (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  evidence text not null check (length(btrim(evidence)) between 1 and 2000),
  filter_hash text not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes')
);
create table public.animal_review_bulk_item (
  operation_id uuid not null references public.animal_review_bulk_operation(id),
  animal_id uuid not null,
  ordinal integer not null,
  expected_revision bigint,
  before_classification text,
  after_classification text,
  status text not null check (status in ('pending','succeeded','skipped','conflict','failed')),
  reason_code text,
  applied_at timestamptz,
  primary key(operation_id,animal_id),
  unique(operation_id,ordinal)
);
create index animal_review_bulk_operation_actor_idx on public.animal_review_bulk_operation(actor_user_id,created_at desc);
create index animal_review_bulk_item_pending_idx on public.animal_review_bulk_item(operation_id,ordinal) where status='pending';
alter table public.animal_review_bulk_operation enable row level security;
alter table public.animal_review_bulk_item enable row level security;
revoke all on public.animal_review_bulk_operation, public.animal_review_bulk_item from public,anon,authenticated,service_role;
grant select on public.animal_review_bulk_operation, public.animal_review_bulk_item to service_role;

create function private.require_animal_review_bulk_actor(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_actor and a.status='active' and a.role='admin'
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())
  ) then raise exception 'Animal review actor unavailable' using errcode='42501';end if;
end $$;
revoke all on function private.require_animal_review_bulk_actor(uuid) from public,anon,authenticated,service_role;
grant execute on function private.require_animal_review_bulk_actor(uuid) to service_role;

create function public.get_animal_review_bulk_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.animal_review_bulk_operation%rowtype;v_items jsonb;v_pending integer;v_succeeded integer;
begin
  perform private.require_animal_review_bulk_actor(p_actor);
  select * into v_op from public.animal_review_bulk_operation where id=p_operation and actor_user_id=p_actor;
  if not found then raise exception 'Animal review operation unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityId',i.animal_id,'status',i.status,'reasonCode',i.reason_code,
    'beforeClassification',i.before_classification,'afterClassification',i.after_classification,
    'expectedRevision',i.expected_revision
  ) order by i.ordinal),'[]'::jsonb),
    count(*) filter(where i.status='pending'),count(*) filter(where i.status='succeeded')
  into v_items,v_pending,v_succeeded
  from public.animal_review_bulk_item i where i.operation_id=p_operation;
  return jsonb_build_object(
    'operationId',v_op.id,'evidence',v_op.evidence,'filterHash',v_op.filter_hash,
    'createdAt',v_op.created_at,'expiresAt',v_op.expires_at,
    'state',case when v_pending=0 then 'done' when v_succeeded=0 then 'queued' else 'partial' end,
    'items',v_items
  );
end $$;
revoke all on function public.get_animal_review_bulk_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_animal_review_bulk_operation(uuid,uuid) to service_role;

create function public.create_animal_review_bulk_preview(p_actor uuid,p_ids uuid[],p_evidence text,p_filter_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op uuid;v_id uuid;v_revision bigint;v_publication text;v_review public.editorial_content_review%rowtype;
  v_status text;v_reason text;v_ordinal integer:=0;
begin
  perform private.require_animal_review_bulk_actor(p_actor);
  if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>1000
     or exists(select 1 from unnest(p_ids) id where id is null)
     or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids)
     or p_evidence is null or length(btrim(p_evidence)) not between 1 and 2000
     or coalesce(p_filter_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid animal review preview' using errcode='22023';end if;
  insert into public.animal_review_bulk_operation(actor_user_id,evidence,filter_hash)
  values(p_actor,btrim(p_evidence),p_filter_hash) returning id into v_op;
  foreach v_id in array p_ids loop
    v_ordinal:=v_ordinal+1;
    select a.publication_state,d.revision into v_publication,v_revision
    from public.animals a left join public.animal_draft d on d.id=a.id where a.id=v_id;
    select * into v_review from public.editorial_content_review
    where entity_kind='animal' and entity_id=v_id and revision_key=v_revision::text;
    if v_revision is null then v_status:='skipped';v_reason:='missing_draft';
    elsif v_publication='published' then v_status:='skipped';v_reason:='published';
    elsif v_review.entity_id is not null then v_status:='skipped';v_reason:='already_classified';
    else v_status:='pending';v_reason:=null;
    end if;
    insert into public.animal_review_bulk_item(
      operation_id,animal_id,ordinal,expected_revision,before_classification,after_classification,status,reason_code
    ) values(v_op,v_id,v_ordinal,v_revision,v_review.classification,
      case when v_status='pending' then 'needs_review' else v_review.classification end,v_status,v_reason);
  end loop;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'animal_review_bulk.preview','animal_review_bulk_operation',v_op::text,
    jsonb_build_object('filterHash',p_filter_hash,'selectionCount',cardinality(p_ids),'evidence',btrim(p_evidence)));
  return public.get_animal_review_bulk_operation(p_actor,v_op);
end $$;
revoke all on function public.create_animal_review_bulk_preview(uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.create_animal_review_bulk_preview(uuid,uuid[],text,text) to service_role;

create function public.apply_animal_review_bulk_item(p_actor uuid,p_operation uuid,p_animal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.animal_review_bulk_operation%rowtype;v_item public.animal_review_bulk_item%rowtype;
  v_revision bigint;v_publication text;v_review public.editorial_content_review%rowtype;
  v_result jsonb;v_status text;v_reason text;
begin
  perform private.require_animal_review_bulk_actor(p_actor);
  select * into v_op from public.animal_review_bulk_operation
  where id=p_operation and actor_user_id=p_actor for update;
  if not found then raise exception 'Animal review operation unavailable' using errcode='42501';end if;
  if v_op.expires_at<=now() then raise exception 'Animal review preview expired' using errcode='P0001';end if;
  select * into v_item from public.animal_review_bulk_item
  where operation_id=p_operation and animal_id=p_animal for update;
  if not found then raise exception 'Animal review item unavailable' using errcode='42501';end if;
  if v_item.status<>'pending' then
    return jsonb_build_object('entityId',p_animal,'status',v_item.status,'reasonCode',v_item.reason_code);
  end if;
  select revision into v_revision from public.animal_draft where id=p_animal for update;
  select publication_state into v_publication from public.animals where id=p_animal;
  select * into v_review from public.editorial_content_review
  where entity_kind='animal' and entity_id=p_animal and revision_key=v_revision::text;
  if v_revision is null then v_status:='skipped';v_reason:='missing_draft';
  elsif v_publication='published' then v_status:='skipped';v_reason:='published';
  elsif v_revision<>v_item.expected_revision then v_status:='conflict';v_reason:='version_changed';
  elsif v_review.entity_id is not null then v_status:='conflict';v_reason:='classification_changed';
  else
    v_result:=public.editorial_review_command(p_actor,jsonb_build_object(
      'entity_kind','animal','entity_id',p_animal,'revision_key',v_revision::text,
      'classification','needs_review','evidence',v_op.evidence));
    if v_result->>'kind'='reviewed' then v_status:='succeeded';v_reason:=null;
    else v_status:='conflict';v_reason:=coalesce(v_result->>'kind','unexpected_result');end if;
  end if;
  update public.animal_review_bulk_item
  set status=v_status,reason_code=v_reason,applied_at=clock_timestamp()
  where operation_id=p_operation and animal_id=p_animal;
  if v_status<>'succeeded' then
    insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor,'animal_review_bulk.item_result','animal_review_bulk_item',p_animal::text,
      jsonb_build_object('operationId',p_operation,'status',v_status,'reasonCode',v_reason));
  end if;
  return jsonb_build_object('entityId',p_animal,'status',v_status,'reasonCode',v_reason);
end $$;
revoke all on function public.apply_animal_review_bulk_item(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_animal_review_bulk_item(uuid,uuid,uuid) to service_role;
