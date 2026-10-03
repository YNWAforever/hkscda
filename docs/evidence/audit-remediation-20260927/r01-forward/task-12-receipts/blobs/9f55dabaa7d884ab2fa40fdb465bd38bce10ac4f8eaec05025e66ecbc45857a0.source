-- T23 finance bank-file dry-run. This function only reads payment/donation facts.
-- It does not credit a payment or queue a receipt. Existing atomic single-item
-- settlement and duplicate-reference enforcement remain the only write path.
create index payment_pending_manual_amount_idx on public.payment(amount_cents,created_at desc)
  where provider in ('fps','payme','manual') and status='pending';

create function public.preview_manual_bank_matches(
  p_actor uuid,p_references text[],p_amounts integer[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_credited jsonb;
  v_pending jsonb;
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_actor and a.status='active' and a.role in ('treasurer','admin')
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=clock_timestamp())
  for share of a,u;
  if not found then raise exception 'Bank preview actor unavailable' using errcode='42501'; end if;

  if p_references is null or p_amounts is null
    or cardinality(p_references)>1000 or cardinality(p_amounts)>1000
    or exists(select 1 from unnest(p_references) ref
      where ref is null or ref !~ '^[a-z0-9][a-z0-9 ./_-]{0,119}$')
    or exists(select 1 from unnest(p_amounts) amount where amount is null or amount<=0)
  then raise exception 'Invalid bank preview input' using errcode='22023'; end if;

  select coalesce(jsonb_agg(q.reference_key order by q.reference_key),'[]'::jsonb)
    into v_credited
  from (
    select distinct lower(btrim(p.bank_reference)) reference_key
    from public.payment p
    where p.provider in ('fps','payme','manual') and p.status='succeeded'
      and lower(btrim(p.bank_reference))=any(p_references)
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'provider',q.provider,'providerRef',q.provider_ref,
    'amountCents',q.amount_cents,'paymentStatus',q.payment_status,
    'donationStatus',q.donation_status
  ) order by q.created_at desc,q.id),'[]'::jsonb)
    into v_pending
  from (
    select p.id,p.provider,p.provider_ref,p.amount_cents,p.status payment_status,
      d.status donation_status,p.created_at
    from public.payment p join public.donation d on d.id=p.donation_id
    where p.provider in ('fps','payme','manual') and p.status='pending'
      and d.status='pending' and d.currency='HKD'
      and p.amount_cents=d.amount_cents and p.amount_cents=any(p_amounts)
    order by p.created_at desc,p.id
    limit 1001
  ) q;
  if jsonb_array_length(v_pending)>1000 then
    return jsonb_build_object('kind','too_broad');
  end if;
  return jsonb_build_object(
    'kind','ok','creditedReferences',v_credited,'pendingPayments',v_pending
  );
end $$;
revoke all on function public.preview_manual_bank_matches(uuid,text[],integer[])
  from public,anon,authenticated;
grant execute on function public.preview_manual_bank_matches(uuid,text[],integer[]) to service_role;
