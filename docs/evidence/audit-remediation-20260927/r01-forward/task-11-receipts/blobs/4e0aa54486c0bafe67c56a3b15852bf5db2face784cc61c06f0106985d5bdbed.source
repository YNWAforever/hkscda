alter table public.sponsorship_delivery_outbox drop constraint sponsorship_delivery_outbox_event_check;
alter table public.sponsorship_delivery_outbox add constraint sponsorship_delivery_outbox_event_check check(event in ('proof_recorded','active','needs_followup','cancelled','refund_recorded'));
-- Gross receipt remains immutable; refunds are separate facts and the canonical
-- refunded counters allow all CRM/receipt readers to report retained money.
alter table public.payment add column refunded_cents integer not null default 0 check(refunded_cents between 0 and amount_cents);
alter table public.donation add column refunded_cents integer not null default 0 check(refunded_cents between 0 and amount_cents);
alter table public.sponsorship_refund drop constraint sponsorship_refund_proof_id_key,drop constraint sponsorship_refund_payment_id_key;
alter table public.sponsorship_refund add column idempotency_key uuid not null default gen_random_uuid(),add column expected_refunded_cents integer not null default 0,add column expected_revision bigint not null default 0;
alter table public.sponsorship_refund add constraint sponsorship_refund_actor_key unique(actor_user_id,idempotency_key);
create function public.record_sponsorship_refund(p_actor uuid,p_proof uuid,p_expected_revision bigint,p_expected_refunded integer,p_key uuid,p_amount integer,p_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid;v_proof public.sponsorship_payment_proof%rowtype;v_source public.sponsorship_payment_source%rowtype;v_prior public.sponsorship_refund%rowtype;v_total integer;v_allocated bigint;v_excess bigint;v_reverse bigint;v_entry record;v_id uuid;
begin
 select id into v_actor from public.admin_user where auth_user_id=p_actor and status='active' and role in ('admin','treasurer');
 if v_actor is null then raise exception 'Finance role required' using errcode='42501';end if;
 if p_key is null or p_amount is null or p_amount<=0 or p_expected_refunded is null or length(trim(coalesce(p_reference,'')))<3 or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Refund amount, expected total, key, transfer reference and reason required';end if;
 perform 1 from public.sponsorship_pledge where id=(select pledge_id from public.sponsorship_payment_proof where id=p_proof) for update;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_key::text,715));
 select * into v_prior from public.sponsorship_refund where actor_user_id=p_actor and idempotency_key=p_key;
 if found then
  if v_prior.proof_id<>p_proof or v_prior.amount_cents<>p_amount or v_prior.expected_revision<>p_expected_revision or v_prior.expected_refunded_cents<>p_expected_refunded or v_prior.bank_reference<>p_reference or v_prior.reason<>p_reason then raise exception 'Refund retry key reused for different facts';end if;
  return jsonb_build_object('kind','refunded','id',v_prior.id,'amountCents',v_prior.amount_cents,'replayed',true);
 end if;
 select * into v_proof from public.sponsorship_payment_proof where id=p_proof for update;
 if not found or v_proof.review_status<>'approved' or v_proof.revision<>p_expected_revision then raise exception 'Stale or unapproved proof';end if;
 select * into v_source from public.sponsorship_payment_source where proof_id=p_proof;
 if not found then raise exception 'Legacy payment must be reconciled before refund';end if;
 perform 1 from public.payment where id=v_source.payment_id for update;
 select coalesce(sum(amount_cents),0) into v_total from public.sponsorship_refund where proof_id=p_proof;
 if v_total<>p_expected_refunded then raise exception 'Refund total changed; reload the ledger';end if;
 if p_amount>v_proof.amount_cents-v_total then raise exception 'Refund exceeds retained received money';end if;
 select coalesce(sum(amount_cents),0) into v_allocated from public.sponsorship_payment_allocation where proof_id=p_proof;
 v_excess:=greatest(0,v_allocated-(v_proof.amount_cents-v_total-p_amount));
 -- Use unattributed money first, then reverse the latest allocations. Earlier
 -- months retain their facts; each partial reversal identifies its original.
 for v_entry in select a.id,a.period_id,a.amount_cents+coalesce((select sum(r.amount_cents) from public.sponsorship_payment_allocation r where r.reverses_allocation_id=a.id),0) net
 from public.sponsorship_payment_allocation a join public.sponsorship_period period on period.id=a.period_id
 where a.proof_id=p_proof and a.reverses_allocation_id is null order by period.period_month desc,a.created_at desc,a.id
 loop
  exit when v_excess=0;v_reverse:=least(v_excess,greatest(0,v_entry.net));
  if v_reverse>0 then insert into public.sponsorship_payment_allocation(period_id,proof_id,amount_cents,reverses_allocation_id,created_by,note) values(v_entry.period_id,p_proof,-v_reverse,v_entry.id,v_actor,p_reason);v_excess:=v_excess-v_reverse;end if;
 end loop;
 insert into public.sponsorship_refund(proof_id,payment_id,amount_cents,bank_reference,reason,actor_user_id,idempotency_key,expected_refunded_cents,expected_revision) values(p_proof,v_source.payment_id,p_amount,p_reference,p_reason,p_actor,p_key,p_expected_refunded,p_expected_revision) returning id into v_id;
 update public.payment set refunded_cents=v_total+p_amount,status=case when v_total+p_amount=amount_cents then 'refunded' else 'succeeded' end where id=v_source.payment_id;
 update public.donation set refunded_cents=v_total+p_amount,status=case when v_total+p_amount=amount_cents then 'refunded' else 'succeeded' end where id=v_source.donation_id;
 update public.receipt set status='void',voided_at=now(),voided_by=v_actor where v_source.donation_id=any(donation_ids) and status='issued';
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'sponsorship_pledge.refund_recorded','sponsorship_pledge',v_proof.pledge_id::text,jsonb_build_object('proofId',p_proof,'paymentId',v_source.payment_id,'refundId',v_id,'amountCents',p_amount,'totalRefundedCents',v_total+p_amount,'reason',p_reason,'reference',p_reference));
 perform private.queue_sponsorship_transition(v_proof.pledge_id,p_proof,'refund_recorded','refund:'||v_id::text);
 update public.sponsorship_delivery_outbox set amount_cents=p_amount where scope='refund:'||v_id::text;
 return jsonb_build_object('kind','refunded','id',v_id,'amountCents',p_amount,'totalRefundedCents',v_total+p_amount);
end; $$;
revoke all on function public.record_sponsorship_refund(uuid,uuid,bigint,integer,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_sponsorship_refund(uuid,uuid,bigint,integer,uuid,integer,text,text) to service_role;

create or replace function public.record_sponsorship_full_refund(p_actor uuid,p_proof uuid,p_expected_revision bigint,p_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remaining integer;v_total integer;v_prior public.sponsorship_refund%rowtype;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('admin','treasurer')) then raise exception 'Finance role required' using errcode='42501';end if;
 perform 1 from public.sponsorship_pledge where id=(select pledge_id from public.sponsorship_payment_proof where id=p_proof) for update;
 select * into v_prior from public.sponsorship_refund where proof_id=p_proof and bank_reference=p_reference and reason=p_reason order by created_at desc limit 1;
 if found then return jsonb_build_object('kind','refunded','id',v_prior.id,'replayed',true);end if;
 select coalesce(sum(amount_cents),0) into v_total from public.sponsorship_refund where proof_id=p_proof;
 select amount_cents-v_total into v_remaining from public.sponsorship_payment_proof where id=p_proof;
 return public.record_sponsorship_refund(p_actor,p_proof,p_expected_revision,v_total,gen_random_uuid(),v_remaining,p_reference,p_reason);
end; $$;

create function private.assert_sponsorship_retained_money() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_amount integer;v_refunded bigint;v_net bigint;
begin
 select amount_cents into v_amount from public.sponsorship_payment_proof where id=new.proof_id for update;
 select coalesce(sum(amount_cents),0) into v_refunded from public.sponsorship_refund where proof_id=new.proof_id;
 select coalesce(sum(amount_cents),0) into v_net from public.sponsorship_payment_allocation where proof_id=new.proof_id;
 if v_net+new.amount_cents>v_amount-v_refunded then raise exception 'Allocation exceeds money retained after refunds';end if;return new;
end; $$;
create trigger sponsorship_retained_money before insert on public.sponsorship_payment_allocation for each row execute function private.assert_sponsorship_retained_money();

create or replace function private.crm_supporter_summary(p_supporter_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
 select jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'language',s.language,'tags',s.tags,'deletedAt',s.deleted_at,
   'roles',coalesce((select jsonb_agg(r.role order by r.role) from public.supporter_role r where r.supporter_id=s.id),'[]'::jsonb),
   'lastGiftAt',last_gift.created_at,'lastGiftAmountCents',last_gift.amount_cents,
   'lifetimeAmountCents',totals.amount,'donationCount',totals.count,'receiptNeeded',totals.receipt,
   'emailConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='email' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1),
   'whatsappConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='whatsapp' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1))
 from public.supporter s
 cross join lateral(select coalesce(sum(d.amount_cents-d.refunded_cents) filter(where d.status='succeeded'),0) amount,count(*) count,coalesce(bool_or(d.receipt_requested),false) receipt from public.donation d where d.supporter_id=s.id) totals
 left join lateral(select d.created_at,d.amount_cents-d.refunded_cents as amount_cents from public.donation d where d.supporter_id=s.id and d.status='succeeded' order by d.created_at desc,d.id desc limit 1) last_gift on true
 where s.id=p_supporter_id;
$$;
create or replace function public.issue_receipt(
  p_donation_id uuid,
  p_supporter_id uuid,
  p_amount_cents integer,
  p_tax_year integer,
  p_issued_at timestamptz
)
returns table (
  receipt_no text,
  receipt_id uuid,
  pdf_url text,
  tax_year integer,
  issued_at timestamptz,
  already_existed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.receipt;
  v_receipt_no text;
  v_receipt_id uuid;
begin
  perform 1 from public.donation where id=p_donation_id and supporter_id=p_supporter_id
    and status='succeeded' and receipt_requested and p_amount_cents=amount_cents-refunded_cents and p_amount_cents>0 for update;
  if not found then raise exception 'Receipt must match the current retained donation amount and request';end if;
  -- Idempotent: an issued receipt already exists for this donation.
  select * into v_existing
  from public.receipt r
  where r.status = 'issued'
    and r.donation_ids[1] = p_donation_id
  limit 1;

  if found then
    receipt_no := v_existing.receipt_no;
    receipt_id := v_existing.id;
    pdf_url := v_existing.pdf_url;
    tax_year := v_existing.tax_year;
    issued_at := v_existing.issued_at;
    already_existed := true;
    return next;
    return;
  end if;

  -- Allocate the number and insert the row in the same (sub)transaction. If the
  -- insert hits the unique index because a concurrent caller won the race, the
  -- exception block rolls back this allocation (no wasted number) and we return
  -- the winner's row.
  v_receipt_no := private.allocate_receipt_number(p_tax_year);

  insert into public.receipt (
    supporter_id,
    receipt_no,
    donation_ids,
    total_amount_cents,
    tax_year,
    issued_at,
    status
  ) values (
    p_supporter_id,
    v_receipt_no,
    array[p_donation_id],
    p_amount_cents,
    p_tax_year,
    p_issued_at,
    'issued'
  )
  returning id into v_receipt_id;

  receipt_no := v_receipt_no;
  receipt_id := v_receipt_id;
  pdf_url := null;
  tax_year := p_tax_year;
  issued_at := p_issued_at;
  already_existed := false;
  return next;
exception
  when unique_violation then
    select * into v_existing
    from public.receipt r
    where r.status = 'issued'
      and r.donation_ids[1] = p_donation_id
    limit 1;

    -- The conflicting row must have existed to raise the violation, but it could
    -- have been voided in the tiny window before this recovery read. Re-raise so
    -- the caller retries cleanly rather than receiving a NULL-filled row.
    if not found then
      raise;
    end if;

    receipt_no := v_existing.receipt_no;
    receipt_id := v_existing.id;
    pdf_url := v_existing.pdf_url;
    tax_year := v_existing.tax_year;
    issued_at := v_existing.issued_at;
    already_existed := true;
    return next;
end;
$$;
create unique index sponsorship_refund_transfer_unique on public.sponsorship_refund(payment_id,lower(trim(bank_reference)));
