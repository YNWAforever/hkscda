create table public.manual_gift_request (
  request_id uuid primary key,
  payload_hash text not null,
  donation_id uuid references public.donation(id),
  payment_id uuid references public.payment(id),
  delivery_job_id uuid,
  created_at timestamptz not null default now()
);
create table public.donation_delivery_job (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references public.donation(id) on delete cascade,
  payment_id uuid not null unique references public.payment(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','complete','retryable','attention_required')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_owner uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_delivery_lease check ((status = 'processing') = (lease_owner is not null and lease_until is not null))
);
alter table public.manual_gift_request add constraint manual_gift_request_delivery_job_fk foreign key (delivery_job_id) references public.donation_delivery_job(id);
alter table public.manual_gift_request enable row level security;
alter table public.donation_delivery_job enable row level security;
revoke all on public.manual_gift_request, public.donation_delivery_job from public, anon, authenticated;
grant select, insert, update on public.manual_gift_request, public.donation_delivery_job to service_role;
create index donation_delivery_due_idx on public.donation_delivery_job(status,next_attempt_at) where status in ('pending','retryable','processing');

-- The validated JSON command is canonical jsonb; object-key ordering cannot change its digest.
-- Request reservation, supporter/consent, finance, audit and outbox commit in one transaction.
create or replace function public.record_manual_gift_with_audit(p_request_id uuid, p_actor_user_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  v_existing public.manual_gift_request%rowtype;
  v_supporter public.supporter%rowtype;
  v_donation uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_job uuid;
  v_now timestamptz := now();
  v_channel text;
begin
  if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('admin','treasurer')) then
    raise exception 'manual_gift_forbidden' using errcode='42501';
  end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object'
    or coalesce(p_input->>'currency','') <> 'HKD'
    or coalesce(p_input->>'method','') not in ('manual','fps','payme')
    or coalesce(p_input->>'paymentStatus','') not in ('pending','succeeded')
    or coalesce(p_input->>'purpose','') not in ('general','medical','sponsor')
    or coalesce((p_input->>'amountCents')::integer,0) not between 1000 and 1000000
    or jsonb_typeof(p_input->'receiptRequested') is distinct from 'boolean'
    or ((p_input->>'supporterId' is not null) = (coalesce(jsonb_typeof(p_input->'supporter'),'null') = 'object'))
    or (p_input->>'paymentStatus'='succeeded' and nullif(trim(p_input->>'bankReference'),'') is null)
  then raise exception 'invalid_manual_gift' using errcode='22023'; end if;
  insert into public.manual_gift_request(request_id,payload_hash) values(p_request_id,v_hash) on conflict do nothing;
  select * into v_existing from public.manual_gift_request where request_id=p_request_id for update;
  if v_existing.payload_hash <> v_hash then raise exception 'manual_gift_payload_conflict' using errcode='23505'; end if;
  if v_existing.donation_id is not null then
    return jsonb_build_object('donationId',v_existing.donation_id,'paymentId',v_existing.payment_id,'deliveryJobId',v_existing.delivery_job_id,'replayed',true);
  end if;
  if p_input->>'supporterId' is not null then
    select * into v_supporter from public.supporter where id=(p_input->>'supporterId')::uuid and deleted_at is null for update;
    if not found then raise exception 'manual_gift_supporter_unavailable' using errcode='22023'; end if;
  else
    insert into public.supporter(name,email,phone,language,tags,source)
    values(p_input#>>'{supporter,name}',lower(p_input#>>'{supporter,email}'),p_input#>>'{supporter,phone}',p_input#>>'{supporter,language}',array(select jsonb_array_elements_text(coalesce(p_input#>'{supporter,tags}','[]'::jsonb))),coalesce(p_input#>>'{supporter,source}','admin_manual'))
    on conflict(email) do update set name=excluded.name,phone=excluded.phone,language=excluded.language,tags=excluded.tags,updated_at=v_now
      where supporter.deleted_at is null
    returning * into v_supporter;
    if not found then raise exception 'manual_gift_supporter_unavailable' using errcode='22023'; end if;
  end if;
  insert into public.supporter_role(supporter_id,role) values(v_supporter.id,'donor') on conflict do nothing;
  foreach v_channel in array array['email','whatsapp'] loop
    if p_input#>>array['consents',v_channel] is not null then
      insert into public.consent(supporter_id,channel,status,source,timestamp)
      values(v_supporter.id,v_channel,case when (p_input#>>array['consents',v_channel])::boolean then 'opt_in' else 'opt_out' end,'admin_manual',v_now);
    end if;
  end loop;
  insert into public.donation(id,supporter_id,amount_cents,currency,purpose,type,status,method,receipt_requested,contact_name,contact_email,contact_phone,contact_language,created_at)
  values(v_donation,v_supporter.id,(p_input->>'amountCents')::integer,'HKD',p_input->>'purpose','one_time',p_input->>'paymentStatus',p_input->>'method',(p_input->>'receiptRequested')::boolean,v_supporter.name,v_supporter.email,v_supporter.phone,v_supporter.language,v_now);
  insert into public.payment(id,donation_id,provider,provider_ref,amount_cents,status,received_at,reconciled_by,bank_reference,created_at)
  values(v_payment,v_donation,p_input->>'method','HKSCDA-'||upper(left(replace(v_donation::text,'-',''),8)),(p_input->>'amountCents')::integer,p_input->>'paymentStatus',case when p_input->>'paymentStatus'='succeeded' then v_now end,case when p_input->>'paymentStatus'='succeeded' then p_actor_user_id end,p_input->>'bankReference',v_now);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,timestamp,detail)
  values(p_actor_user_id,'donation.manual_create','donation',v_donation::text,v_now,jsonb_build_object('requestId',p_request_id,'method',p_input->>'method','paymentStatus',p_input->>'paymentStatus','consentChannels',coalesce(p_input->'consents','{}'::jsonb)));
  if p_input->>'paymentStatus'='succeeded' then insert into public.donation_delivery_job(donation_id,payment_id) values(v_donation,v_payment) returning id into v_job; end if;
  update public.manual_gift_request set donation_id=v_donation,payment_id=v_payment,delivery_job_id=v_job where request_id=p_request_id;
  return jsonb_build_object('donationId',v_donation,'paymentId',v_payment,'deliveryJobId',v_job,'replayed',false);
end $$;
revoke all on function public.record_manual_gift_with_audit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_manual_gift_with_audit(uuid,uuid,jsonb) to service_role;

-- One conditional UPDATE is the lock: competing claims recheck after waiting.
create or replace function public.claim_donation_delivery_job(p_job_id uuid,p_owner uuid,p_lease_until timestamptz)
returns table(payment_id uuid,attempts integer) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_owner is null or p_lease_until is null or p_lease_until <= now() or p_lease_until > now()+interval '10 minutes' then
    raise exception 'invalid_delivery_lease' using errcode='22023';
  end if;
  return query update public.donation_delivery_job j
  set status='processing',lease_owner=p_owner,lease_until=p_lease_until,attempts=j.attempts+1,updated_at=now()
  where j.id=p_job_id and (
    (j.status in ('pending','retryable') and (j.next_attempt_at is null or j.next_attempt_at<=now()))
    or (j.status='processing' and j.lease_until<=now())
  ) returning j.payment_id,j.attempts;
end $$;
revoke all on function public.claim_donation_delivery_job(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_donation_delivery_job(uuid,uuid,timestamptz) to service_role;

create or replace function public.retry_donation_delivery_job_with_audit(p_job_id uuid,p_actor_user_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('admin','treasurer')) then
    raise exception 'delivery_retry_forbidden' using errcode='42501';
  end if;
  update public.donation_delivery_job set status='pending',next_attempt_at=null,error_code=null,lease_until=null,lease_owner=null,updated_at=now()
  where id=p_job_id and status in ('retryable','attention_required') returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'donation.delivery_retry','donation_delivery_job',p_job_id::text,'{}'::jsonb);
  return true;
end $$;
revoke all on function public.retry_donation_delivery_job_with_audit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_donation_delivery_job_with_audit(uuid,uuid) to service_role;


