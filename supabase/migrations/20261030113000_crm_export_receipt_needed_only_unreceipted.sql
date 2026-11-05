-- BUG-46 (exports): 20261030111000 applied the receipt-needed rule to the supporter list and
-- its filter, but the donation-level receiptNeeded filters in the CRM exports still compared
-- receipt_requested alone. With receiptNeeded=true the donation CSV (crm_export_donations,
-- latest in 20260913083503) and a queued donations export (enqueue_crm_export_job, latest in
-- 20260927090000) still listed receipted, failed, refunded and below-threshold donations.
--
-- Both now apply the same rule (isReceiptEligible in src/lib/donations/domain.ts, BUG-05): the
-- donation succeeded, the donor requested a receipt, amount_cents - refunded_cents is at least
-- HK$100 (10000 cents), and no issued (non-void) receipt contains it. receiptNeeded=false selects
-- the remaining donations. Each function is redefined from its latest body with only that
-- predicate changed; signatures, security definer, search_path and grants are unchanged.

create or replace function public.crm_export_donations(p_filters jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(
  select d.*,s.name supporter_name,s.email supporter_email from private.crm_matching_supporters(p_filters) s join public.donation d on d.supporter_id=s.id
  where (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
  and (p_filters->>'receiptNeeded' is null or (
    d.status='succeeded' and d.receipt_requested and d.amount_cents-d.refunded_cents>=10000
    and not exists(select 1 from public.receipt r where r.status='issued' and r.donation_ids @> array[d.id])
  )=(p_filters->>'receiptNeeded')::boolean)
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

create or replace function public.enqueue_crm_export_job(p_actor uuid,p_kind text,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ids uuid[]; v_job public.crm_export_job%rowtype;
begin
  if not private.crm_export_actor_allowed(p_actor) then
    raise exception 'crm_export_forbidden' using errcode='42501';
  end if;
  if p_kind not in ('supporters','donations') or jsonb_typeof(p_filters)<>'object' then
    raise exception 'invalid_crm_export_request' using errcode='22023';
  end if;
  if p_kind='supporters' then
    select coalesce(array_agg(s.id order by s.created_at desc,s.id desc),'{}'::uuid[])
      into v_ids from private.crm_matching_supporters(p_filters) s;
  else
    select coalesce(array_agg(d.id order by d.created_at desc,d.id desc),'{}'::uuid[])
      into v_ids from private.crm_matching_supporters(p_filters) s
      join public.donation d on d.supporter_id=s.id
      where (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
        and (p_filters->>'receiptNeeded' is null or (
          d.status='succeeded' and d.receipt_requested and d.amount_cents-d.refunded_cents>=10000
          and not exists(select 1 from public.receipt r where r.status='issued' and r.donation_ids @> array[d.id])
        )=(p_filters->>'receiptNeeded')::boolean);
  end if;
  if cardinality(v_ids)>20000 then
    raise exception 'crm_export_too_large' using errcode='P4130';
  end if;
  insert into public.crm_export_job(actor_user_id,kind,filters,item_ids)
    values(p_actor,p_kind,p_filters,v_ids) returning * into v_job;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,timestamp,detail)
    values(p_actor,'export.job.create','crm_export',v_job.id::text,clock_timestamp(),
      jsonb_build_object('kind',p_kind,'rowCount',v_job.total));
  return jsonb_build_object('id',v_job.id,'kind',v_job.kind,'total',v_job.total,
    'status',v_job.status,'processed',0,'expiresAt',v_job.expires_at);
end;
$$;
revoke all on function public.enqueue_crm_export_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_crm_export_job(uuid,text,jsonb) to service_role;
