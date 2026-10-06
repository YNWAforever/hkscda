-- Gross and refunded amounts remain separately exportable.
create or replace function public.crm_export_donations(p_filters jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(
  select d.*,s.name supporter_name,s.email supporter_email from private.crm_matching_supporters(p_filters) s join public.donation d on d.supporter_id=s.id
  where (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
  and (p_filters->>'receiptNeeded' is null or d.receipt_requested=(p_filters->>'receiptNeeded')::boolean)
 ), total as(select count(*) n from matches),
 page as(select * from matches where (select n<=5000 from total) order by created_at desc,id desc limit 5000)
 select jsonb_build_object('total',total.n,'overflow',total.n>5000,'donations',coalesce((
 select jsonb_agg(jsonb_build_object('supporterId',d.supporter_id,'supporterName',d.supporter_name,'supporterEmail',d.supporter_email,'donationId',d.id,'amountCents',d.amount_cents,'refundedCents',case when d.status='refunded' then d.amount_cents else d.refunded_cents end,
 'purpose',d.purpose,'customPurpose',d.custom_purpose,'status',d.status,'method',d.method,'receiptRequested',d.receipt_requested,'createdAt',d.created_at,
 'receiptNo',(select r.receipt_no from public.receipt r where r.supporter_id=d.supporter_id and r.status='issued' and r.donation_ids @> array[d.id] order by r.issued_at desc,r.id desc limit 1)) order by d.created_at desc,d.id desc) from page d
 ),'[]'::jsonb)) from total;
$$;
revoke all on function public.crm_export_donations(jsonb) from public,anon,authenticated;
grant execute on function public.crm_export_donations(jsonb) to service_role;



-- A partly refunded external payment cannot be silently linked as wholly retained money.
create or replace function public.reconcile_legacy_sponsorship_payment(p_actor uuid,p_proof uuid,p_payment uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proof public.sponsorship_payment_proof%rowtype; v_payment public.payment%rowtype; v_supporter uuid;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('admin','treasurer')) then raise exception 'Finance role required' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Reconciliation reason required'; end if;
 perform 1 from public.sponsorship_pledge where id=(select pledge_id from public.sponsorship_payment_proof where id=p_proof) for update;
 select * into v_proof from public.sponsorship_payment_proof where id=p_proof for update;
 select * into v_payment from public.payment where id=p_payment for update;
 select supporter_id into v_supporter from public.sponsorship_pledge where id=v_proof.pledge_id;
 if v_proof.id is null or v_proof.review_status <> 'approved' or v_payment.id is null or v_payment.status <> 'succeeded' or v_payment.refunded_cents<>0 or v_payment.amount_cents <> v_proof.amount_cents
 or not exists(select 1 from public.donation where id=v_payment.donation_id and supporter_id=v_supporter and amount_cents=v_proof.amount_cents and refunded_cents=0 and status='succeeded') then raise exception 'Legacy payment does not match approved proof'; end if;
 if exists(select 1 from public.sponsorship_payment_source where proof_id=p_proof and payment_id=p_payment) then return jsonb_build_object('kind','already_linked'); end if;
 insert into public.sponsorship_payment_source values(p_proof,p_payment,v_payment.donation_id,'legacy_reconciled',now());
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'sponsorship_pledge.money_reconciled','sponsorship_pledge',v_proof.pledge_id::text,jsonb_build_object('proofId',p_proof,'paymentId',p_payment,'reason',p_reason));
 return jsonb_build_object('kind','linked','paymentId',p_payment,'donationId',v_payment.donation_id);
end; $$;
