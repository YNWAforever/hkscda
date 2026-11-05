-- BUG-46: the supporter list's "receipt needed" column was bool_or(receipt_requested) over every
-- donation (private.crm_supporter_summary, last defined in 20260913081521), and the
-- receiptNeeded filter in private.crm_matching_supporters (20260905162615) matched any donation
-- with receipt_requested. Once a receipt was issued, or the donation failed or was refunded, the
-- list and CSV still said 需要檢查 / needs review, and the filter kept returning the supporter.
--
-- A donation now needs a receipt only under the BUG-05 rule the app applies
-- (isReceiptEligible in src/lib/donations/domain.ts, and issue_receipt itself): it succeeded,
-- the donor requested a receipt, the money retained after refunds (amount_cents -
-- refunded_cents) is at least HK$100 (10000 cents), and no issued (non-void) receipt covers it.
-- receiptNeeded is true when any donation of the supporter needs one, and the filter selects
-- exactly the supporters whose column shows the requested value. Both functions are redefined
-- from their latest bodies; only the receipt predicate changes. Signatures, security invoker,
-- search_path and the revokes are unchanged.

create or replace function private.crm_matching_supporters(p_filters jsonb)
returns setof public.supporter language sql stable set search_path = public, pg_temp as $$
 select s.* from public.supporter s
 where (coalesce((p_filters->>'includeDeleted')::boolean,false) or s.deleted_at is null)
 and (p_filters->>'tag' is null or s.tags @> array[p_filters->>'tag'])
 and (p_filters->>'role' is null or exists(select 1 from public.supporter_role r where r.supporter_id=s.id and r.role=p_filters->>'role'))
 and (p_filters->>'purpose' is null or exists(
   select 1 from public.donation d where d.supporter_id=s.id and d.purpose=p_filters->>'purpose'))
 and (p_filters->>'receiptNeeded' is null or exists(
   select 1 from public.donation d where d.supporter_id=s.id
   and d.status='succeeded' and d.receipt_requested and d.amount_cents-d.refunded_cents>=10000
   and not exists(select 1 from public.receipt r where r.status='issued' and r.donation_ids @> array[d.id])
 )=(p_filters->>'receiptNeeded')::boolean)
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
 cross join lateral(select coalesce(sum(d.amount_cents-d.refunded_cents) filter(where d.status='succeeded'),0) amount,count(*) count,
   coalesce(bool_or(
     d.status='succeeded' and d.receipt_requested and d.amount_cents-d.refunded_cents>=10000
     and not exists(select 1 from public.receipt r where r.status='issued' and r.donation_ids @> array[d.id])
   ),false) receipt
   from public.donation d where d.supporter_id=s.id) totals
 left join lateral(select d.created_at,d.amount_cents-d.refunded_cents as amount_cents from public.donation d where d.supporter_id=s.id and d.status='succeeded' order by d.created_at desc,d.id desc limit 1) last_gift on true
 where s.id=p_supporter_id;
$$;
revoke all on function private.crm_supporter_summary(uuid) from public,anon,authenticated;
