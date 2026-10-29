-- BUG-23: a manual gift with an inline supporter overwrote an existing supporter.
--
-- record_manual_gift_with_audit's inline-supporter branch upserted on email. When the email
-- already belonged to a supporter, that supporter's name, phone (to null when omitted),
-- language and tags (to [] when omitted) were replaced, with no supporter.update audit row,
-- so the old values could not be recovered. The admin dialog always sends supporterId, so
-- this was reachable through the API only.
--
-- This redefinition is the 20260905155357 function with one behaviour change: on an email
-- conflict the existing, non-deleted supporter is locked and used unchanged (the donation's
-- contact snapshot comes from that record, as it does for supporterId). A soft-deleted
-- supporter is still refused with manual_gift_supporter_unavailable, as before. The
-- donation.manual_create audit detail now also records the supporter id and whether an
-- existing supporter was reused. Signature, security definer, search_path and grants are
-- unchanged.

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
  v_reused boolean := false;
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
    on conflict(email) do nothing
    returning * into v_supporter;
    if not found then
      -- BUG-23: an existing supporter is reused as it is; the gift never edits its details.
      select * into v_supporter from public.supporter
      where email=lower(p_input#>>'{supporter,email}') and deleted_at is null for update;
      if not found then raise exception 'manual_gift_supporter_unavailable' using errcode='22023'; end if;
      v_reused := true;
    end if;
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
  values(p_actor_user_id,'donation.manual_create','donation',v_donation::text,v_now,jsonb_build_object('requestId',p_request_id,'method',p_input->>'method','paymentStatus',p_input->>'paymentStatus','consentChannels',coalesce(p_input->'consents','{}'::jsonb),'supporterId',v_supporter.id,'existingSupporterReused',v_reused));
  if p_input->>'paymentStatus'='succeeded' then insert into public.donation_delivery_job(donation_id,payment_id) values(v_donation,v_payment) returning id into v_job; end if;
  update public.manual_gift_request set donation_id=v_donation,payment_id=v_payment,delivery_job_id=v_job where request_id=p_request_id;
  return jsonb_build_object('donationId',v_donation,'paymentId',v_payment,'deliveryJobId',v_job,'replayed',false);
end $$;

-- Unchanged from 20260905155357: service_role only.
revoke all on function public.record_manual_gift_with_audit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_manual_gift_with_audit(uuid,uuid,jsonb) to service_role;
