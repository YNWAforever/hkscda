-- T23 finance safety prerequisite: one bank transfer cannot credit two manual payments.
-- A pre-existing duplicate aborts this migration; review it manually on a data-bearing clone.
create unique index payment_manual_bank_reference_unique
  on public.payment (lower(btrim(bank_reference)))
  where provider in ('fps','payme','manual')
    and status='succeeded'
    and nullif(btrim(bank_reference),'') is not null;

create function public.reconcile_manual_payment_atomic(
  p_actor uuid,p_payment uuid,p_reference text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_payment public.payment%rowtype;
  v_donation public.donation%rowtype;
  v_reference text:=btrim(p_reference);
begin
  if not exists (
    select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
    where a.auth_user_id=p_actor and a.status='active' and a.role in ('treasurer','admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=clock_timestamp())
  ) then raise exception 'Manual finance actor unavailable' using errcode='42501';end if;
  if v_reference is null or length(v_reference) not between 1 and 120
  then raise exception 'Invalid bank reference' using errcode='22023';end if;

  select * into v_payment from public.payment where id=p_payment for update;
  if not found then return jsonb_build_object('kind','not_found');end if;
  if v_payment.provider not in ('fps','payme','manual') then
    return jsonb_build_object('kind','provider_denied');
  end if;
  select * into v_donation from public.donation where id=v_payment.donation_id for update;
  if v_payment.status<>'pending' or v_donation.status<>'pending' then
    return jsonb_build_object('kind','state_conflict','paymentStatus',v_payment.status,'donationStatus',v_donation.status);
  end if;
  if v_payment.amount_cents<>v_donation.amount_cents or v_donation.currency<>'HKD' then
    return jsonb_build_object('kind','amount_mismatch','expectedCents',v_donation.amount_cents,'actualCents',v_payment.amount_cents);
  end if;
  -- The partial unique index serializes the same normalized reference, including races.
  update public.payment set status='succeeded',bank_reference=v_reference,
    received_at=clock_timestamp(),reconciled_by=p_actor,updated_at=clock_timestamp()
  where id=p_payment;
  update public.donation set status='succeeded',updated_at=clock_timestamp()
  where id=v_donation.id;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor,'payment.mark_received','payment',p_payment::text,
    jsonb_build_object('donationId',v_donation.id,'bankReference',v_reference,'amountCents',v_payment.amount_cents));
  return jsonb_build_object('kind','applied','paymentId',p_payment,'donationId',v_donation.id);
end $$;
revoke all on function public.reconcile_manual_payment_atomic(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_manual_payment_atomic(uuid,uuid,text) to service_role;
