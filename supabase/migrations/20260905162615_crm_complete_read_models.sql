-- CRM reads execute filtering and aggregation under one SQL snapshot, then bound the output.
-- Private helpers are not callable through PostgREST; only service-role entry points are exposed.

create or replace function private.crm_matching_supporters(p_filters jsonb)
returns setof public.supporter language sql stable set search_path = public, pg_temp as $$
 select s.* from public.supporter s
 where (coalesce((p_filters->>'includeDeleted')::boolean,false) or s.deleted_at is null)
 and (p_filters->>'tag' is null or s.tags @> array[p_filters->>'tag'])
 and (p_filters->>'role' is null or exists(select 1 from public.supporter_role r where r.supporter_id=s.id and r.role=p_filters->>'role'))
 and ((p_filters->>'purpose' is null and p_filters->>'receiptNeeded' is null) or exists(
   select 1 from public.donation d where d.supporter_id=s.id
   and (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
   and (p_filters->>'receiptNeeded' is null or d.receipt_requested=(p_filters->>'receiptNeeded')::boolean)))
 and ((p_filters->>'consentChannel' is null and p_filters->>'consentStatus' is null) or exists(
   select 1 from (select distinct on (c.channel) c.channel,c.status from public.consent c where c.supporter_id=s.id
     order by c.channel,c.timestamp desc,(c.status='opt_out') desc,c.id desc) latest
   where (p_filters->>'consentChannel' is null or latest.channel=p_filters->>'consentChannel')
   and (p_filters->>'consentStatus' is null or latest.status=p_filters->>'consentStatus')))
 and (nullif(trim(p_filters->>'q'),'') is null
   or lower(s.email::text)=lower(trim(p_filters->>'q'))
   or strpos(lower(s.name),lower(trim(p_filters->>'q')))>0
   or strpos(lower(coalesce(s.phone,'')),lower(trim(p_filters->>'q')))>0
   or exists(select 1 from public.donation d where d.supporter_id=s.id and
      (d.id::text=lower(trim(p_filters->>'q')) or d.purpose=trim(p_filters->>'q') or exists(
        select 1 from public.payment p where p.donation_id=d.id and
        (strpos(lower(coalesce(p.provider_ref,'')),lower(trim(p_filters->>'q')))>0 or strpos(lower(coalesce(p.bank_reference,'')),lower(trim(p_filters->>'q')))>0))))
   or exists(select 1 from public.receipt r where r.supporter_id=s.id and strpos(lower(r.receipt_no),lower(trim(p_filters->>'q')))>0));
$$;
revoke all on function private.crm_matching_supporters(jsonb) from public,anon,authenticated;

create or replace function private.crm_supporter_summary(p_supporter_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
 select jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'language',s.language,'tags',s.tags,'deletedAt',s.deleted_at,
   'roles',coalesce((select jsonb_agg(r.role order by r.role) from public.supporter_role r where r.supporter_id=s.id),'[]'::jsonb),
   'lastGiftAt',last_gift.created_at,'lastGiftAmountCents',last_gift.amount_cents,
   'lifetimeAmountCents',totals.amount,'donationCount',totals.count,'receiptNeeded',totals.receipt,
   'emailConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='email' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1),
   'whatsappConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='whatsapp' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1))
 from public.supporter s
 cross join lateral(select coalesce(sum(d.amount_cents) filter(where d.status='succeeded'),0) amount,count(*) count,coalesce(bool_or(d.receipt_requested),false) receipt from public.donation d where d.supporter_id=s.id) totals
 left join lateral(select d.created_at,d.amount_cents from public.donation d where d.supporter_id=s.id and d.status='succeeded' order by d.created_at desc,d.id desc limit 1) last_gift on true
 where s.id=p_supporter_id;
$$;
revoke all on function private.crm_supporter_summary(uuid) from public,anon,authenticated;

create or replace function public.crm_supporter_summary(p_supporter_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select private.crm_supporter_summary(p_supporter_id);
$$;
revoke all on function public.crm_supporter_summary(uuid) from public,anon,authenticated;
grant execute on function public.crm_supporter_summary(uuid) to service_role;

create or replace function public.crm_read_supporters(p_filters jsonb,p_offset integer default 0,p_limit integer default 25,p_export boolean default false)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(select s.id,s.created_at from private.crm_matching_supporters(p_filters) s),
 total as (select count(*) n from matches),
 page as (select m.id,m.created_at from matches m where not p_export or (select n<=5000 from total)
   order by m.created_at desc,m.id desc offset case when p_export then 0 else greatest(0,p_offset) end
   limit case when p_export then 5000 else least(100,greatest(1,p_limit)) end)
 select jsonb_build_object('total',total.n,'overflow',p_export and total.n>5000,
 'supporters',coalesce((select jsonb_agg(private.crm_supporter_summary(page.id) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)) from total;
$$;
revoke all on function public.crm_read_supporters(jsonb,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.crm_read_supporters(jsonb,integer,integer,boolean) to service_role;

create or replace function public.crm_export_donations(p_filters jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(
  select d.*,s.name supporter_name,s.email supporter_email from private.crm_matching_supporters(p_filters) s join public.donation d on d.supporter_id=s.id
  where (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
  and (p_filters->>'receiptNeeded' is null or d.receipt_requested=(p_filters->>'receiptNeeded')::boolean)
 ), total as(select count(*) n from matches),
 page as(select * from matches where (select n<=5000 from total) order by created_at desc,id desc limit 5000)
 select jsonb_build_object('total',total.n,'overflow',total.n>5000,'donations',coalesce((
 select jsonb_agg(jsonb_build_object('supporterId',d.supporter_id,'supporterName',d.supporter_name,'supporterEmail',d.supporter_email,'donationId',d.id,'amountCents',d.amount_cents,
 'purpose',d.purpose,'customPurpose',d.custom_purpose,'status',d.status,'method',d.method,'receiptRequested',d.receipt_requested,'createdAt',d.created_at,
 'receiptNo',(select r.receipt_no from public.receipt r where r.supporter_id=d.supporter_id and r.status='issued' and r.donation_ids @> array[d.id] order by r.issued_at desc,r.id desc limit 1)) order by d.created_at desc,d.id desc) from page d
 ),'[]'::jsonb)) from total;
$$;
revoke all on function public.crm_export_donations(jsonb) from public,anon,authenticated;
grant execute on function public.crm_export_donations(jsonb) to service_role;


