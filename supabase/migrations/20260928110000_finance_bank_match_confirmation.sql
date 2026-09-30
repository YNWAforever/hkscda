-- T23 canonical-bank exact-match confirmation. No provider call or immediate delivery.
create table public.finance_bank_match_operation (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '15 minutes')
);
create table public.finance_bank_match_item (
  operation_id uuid not null references public.finance_bank_match_operation(id),
  ordinal integer not null check (ordinal between 1 and 1000),
  payment_id uuid not null,
  bank_reference text not null check (length(btrim(bank_reference)) between 1 and 120),
  payment_hint text not null check (length(btrim(payment_hint)) between 1 and 120 and payment_hint !~ '[[:cntrl:]]'),
  amount_cents integer not null check (amount_cents>0),
  expected_payment_updated_at timestamptz,
  expected_donation_updated_at timestamptz,
  status text not null check (status in ('pending','succeeded','skipped','conflict','failed')),
  reason_code text,
  delivery_job_id uuid,
  applied_at timestamptz,
  primary key(operation_id,ordinal),
  unique(operation_id,payment_id)
);
create unique index finance_bank_match_item_reference_unique
  on public.finance_bank_match_item(operation_id,lower(btrim(bank_reference)));
create index finance_bank_match_operation_actor_idx
  on public.finance_bank_match_operation(actor_user_id,created_at desc);
create index finance_bank_match_item_pending_idx
  on public.finance_bank_match_item(operation_id,ordinal) where status='pending';
alter table public.finance_bank_match_operation enable row level security;
alter table public.finance_bank_match_item enable row level security;
revoke all on public.finance_bank_match_operation,public.finance_bank_match_item
  from public,anon,authenticated,service_role;
grant select on public.finance_bank_match_operation,public.finance_bank_match_item to service_role;

create function private.require_finance_bank_match_actor(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_actor and a.status='active' and a.role in ('treasurer','admin')
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=clock_timestamp())
  for share of a,u;
  if not found then raise exception 'finance_bank_match_actor_forbidden' using errcode='42501'; end if;
end $$;
revoke all on function private.require_finance_bank_match_actor(uuid)
  from public,anon,authenticated,service_role;

create function public.get_finance_bank_match_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op public.finance_bank_match_operation%rowtype;
  v_items jsonb;
  v_pending integer;
  v_succeeded integer;
begin
  perform private.require_finance_bank_match_actor(p_actor);
  select * into v_op from public.finance_bank_match_operation
  where id=p_operation and actor_user_id=p_actor;
  if not found then raise exception 'finance_bank_match_operation_forbidden' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinal',i.ordinal,'paymentId',i.payment_id,'bankReference',i.bank_reference,
    'paymentHint',i.payment_hint,'amountCents',i.amount_cents,'status',i.status,'reasonCode',i.reason_code,
    'deliveryJobId',i.delivery_job_id,'appliedAt',i.applied_at
  ) order by i.ordinal),'[]'::jsonb),
  count(*) filter(where i.status='pending'),count(*) filter(where i.status='succeeded')
  into v_items,v_pending,v_succeeded
  from public.finance_bank_match_item i where i.operation_id=p_operation;
  return jsonb_build_object(
    'operationId',v_op.id,'fileSha256',v_op.file_sha256,
    'createdAt',v_op.created_at,'expiresAt',v_op.expires_at,
    'state',case when v_pending=0 then 'done' when v_succeeded=0 then 'queued' else 'partial' end,
    'items',v_items
  );
end $$;
revoke all on function public.get_finance_bank_match_operation(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.get_finance_bank_match_operation(uuid,uuid) to service_role;

create function public.create_finance_bank_match_preview(p_actor uuid,p_file_sha text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op uuid;
  v_input jsonb;
  v_ordinal integer;
  v_payment uuid;
  v_reference text;
  v_hint text;
  v_amount integer;
  v_payment_row public.payment%rowtype;
  v_donation_row public.donation%rowtype;
  v_status text;
  v_reason text;
begin
  perform private.require_finance_bank_match_actor(p_actor);
  if coalesce(p_file_sha,'') !~ '^[0-9a-f]{64}$'
    or p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>1000
  then raise exception 'invalid_finance_bank_match_preview' using errcode='22023'; end if;
  insert into public.finance_bank_match_operation(actor_user_id,file_sha256)
  values(p_actor,p_file_sha) returning id into v_op;
  for v_input in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_input)<>'object'
      or coalesce(v_input->>'ordinal','') !~ '^[0-9]{1,4}$'
      or coalesce(v_input->>'paymentId','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(v_input->>'amountCents','') !~ '^[1-9][0-9]{0,8}$'
    then raise exception 'invalid_finance_bank_match_item' using errcode='22023'; end if;
    v_ordinal:=(v_input->>'ordinal')::integer;
    v_payment:=(v_input->>'paymentId')::uuid;
    v_reference:=btrim(v_input->>'bankReference');
    v_hint:=btrim(v_input->>'paymentHint');
    v_amount:=(v_input->>'amountCents')::integer;
    if v_ordinal not between 1 and 1000 or v_reference is null
      or v_hint is null or length(v_hint) not between 1 and 120
      or v_hint ~ '[[:cntrl:]]'
      or length(v_reference) not between 1 and 120
      or v_reference ~ '[[:cntrl:]]'
    then raise exception 'invalid_finance_bank_match_item' using errcode='22023'; end if;
    select * into v_payment_row from public.payment where id=v_payment;
    if v_payment_row.id is null then
      v_status:='skipped';v_reason:='not_found';
    else
      select * into v_donation_row from public.donation where id=v_payment_row.donation_id;
      if v_donation_row.id is null then v_status:='skipped';v_reason:='donation_missing';
      elsif v_payment_row.status<>'pending' or v_donation_row.status<>'pending'
      then v_status:='skipped';v_reason:='status_changed';
      elsif v_payment_row.provider not in ('fps','payme','manual')
        or v_payment_row.amount_cents<>v_amount
        or v_donation_row.amount_cents<>v_amount
        or v_donation_row.currency<>'HKD'
      then v_status:='skipped';v_reason:='payment_mismatch';
      elsif lower(btrim(v_payment_row.provider_ref)) is distinct from lower(v_hint)
      then v_status:='skipped';v_reason:='hint_changed';
      elsif exists(select 1 from public.payment p
        where p.status='succeeded' and p.provider in ('fps','payme','manual')
          and lower(btrim(p.bank_reference))=lower(v_reference))
      then v_status:='skipped';v_reason:='reference_used';
      else v_status:='pending';v_reason:=null;
      end if;
    end if;
    insert into public.finance_bank_match_item(
      operation_id,ordinal,payment_id,bank_reference,payment_hint,amount_cents,
      expected_payment_updated_at,expected_donation_updated_at,status,reason_code
    ) values(v_op,v_ordinal,v_payment,v_reference,v_hint,v_amount,
      v_payment_row.updated_at,v_donation_row.updated_at,v_status,v_reason);
  end loop;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'finance_bank_match.preview','finance_bank_match_operation',v_op::text,
    jsonb_build_object('fileSha256',p_file_sha,'selectionCount',jsonb_array_length(p_items)));
  return public.get_finance_bank_match_operation(p_actor,v_op);
end $$;
revoke all on function public.create_finance_bank_match_preview(uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.create_finance_bank_match_preview(uuid,text,jsonb) to service_role;

create function public.apply_finance_bank_match_item(p_actor uuid,p_operation uuid,p_ordinal integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op public.finance_bank_match_operation%rowtype;
  v_item public.finance_bank_match_item%rowtype;
  v_payment public.payment%rowtype;
  v_donation public.donation%rowtype;
  v_result jsonb;
  v_status text;
  v_reason text;
  v_job uuid;
begin
  perform private.require_finance_bank_match_actor(p_actor);
  select * into v_op from public.finance_bank_match_operation
  where id=p_operation and actor_user_id=p_actor for update;
  if not found then raise exception 'finance_bank_match_operation_forbidden' using errcode='42501'; end if;
  select * into v_item from public.finance_bank_match_item
  where operation_id=p_operation and ordinal=p_ordinal for update;
  if not found then raise exception 'finance_bank_match_item_forbidden' using errcode='42501'; end if;
  if v_item.status<>'pending' then
    return jsonb_build_object('ordinal',p_ordinal,'paymentId',v_item.payment_id,
      'status',v_item.status,'reasonCode',v_item.reason_code,'deliveryJobId',v_item.delivery_job_id);
  end if;
  if v_op.expires_at<=clock_timestamp() then
    raise exception 'finance_bank_match_preview_expired' using errcode='P0001'; end if;
  select * into v_payment from public.payment where id=v_item.payment_id for update;
  if v_payment.id is null then v_status:='conflict';v_reason:='not_found';
  else
    select * into v_donation from public.donation where id=v_payment.donation_id for update;
    -- Entity locks can outlive the preview even when neither row changed.
    if v_op.expires_at<=clock_timestamp() then
      raise exception 'finance_bank_match_preview_expired' using errcode='P0001'; end if;
    if v_donation.id is null then v_status:='conflict';v_reason:='donation_missing';
    elsif v_payment.status<>'pending' or v_donation.status<>'pending'
    then v_status:='conflict';v_reason:='status_changed';
    elsif v_payment.updated_at is distinct from v_item.expected_payment_updated_at
      or v_donation.updated_at is distinct from v_item.expected_donation_updated_at
    then v_status:='conflict';v_reason:='version_changed';
    elsif lower(btrim(v_payment.provider_ref)) is distinct from lower(btrim(v_item.payment_hint))
    then v_status:='conflict';v_reason:='hint_changed';
    elsif v_payment.provider not in ('fps','payme','manual')
      or v_payment.amount_cents<>v_item.amount_cents
      or v_donation.amount_cents<>v_item.amount_cents
      or v_donation.currency<>'HKD'
    then v_status:='conflict';v_reason:='payment_mismatch';
    elsif exists(select 1 from public.payment p
      where p.status='succeeded' and p.provider in ('fps','payme','manual')
        and lower(btrim(p.bank_reference))=lower(btrim(v_item.bank_reference)))
    then v_status:='conflict';v_reason:='reference_used';
    else
      begin
        v_result:=public.reconcile_manual_payment_atomic(p_actor,v_item.payment_id,v_item.bank_reference);
        if v_result->>'kind'='applied' then
          v_status:='succeeded';v_reason:=null;v_job:=(v_result->>'deliveryJobId')::uuid;
        else
          v_status:='conflict';v_reason:=coalesce(v_result->>'kind','unexpected_result');
        end if;
      exception when unique_violation then
        v_status:='conflict';v_reason:='reference_used';
      end;
    end if;
  end if;
  -- Reconciliation can wait on the normalized-reference unique index. Keep
  -- expiry outside its exception block so all money/job/audit writes roll back,
  -- including a handled unique_violation, before recording a durable result.
  if v_op.expires_at<=clock_timestamp() then
    raise exception 'finance_bank_match_preview_expired' using errcode='P0001'; end if;
  update public.finance_bank_match_item set status=v_status,reason_code=v_reason,
    delivery_job_id=v_job,applied_at=clock_timestamp()
  where operation_id=p_operation and ordinal=p_ordinal;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'finance_bank_match.item_result','finance_bank_match_item',v_item.payment_id::text,
    jsonb_build_object('operationId',p_operation,'ordinal',p_ordinal,'status',v_status,'reasonCode',v_reason));
  return jsonb_build_object('ordinal',p_ordinal,'paymentId',v_item.payment_id,
    'status',v_status,'reasonCode',v_reason,'deliveryJobId',v_job);
end $$;
revoke all on function public.apply_finance_bank_match_item(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.apply_finance_bank_match_item(uuid,uuid,integer) to service_role;
