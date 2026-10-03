-- Separate financial confirmation from programme matching.
create or replace function public.review_exact_sponsorship_payment_proof(
  p_pledge_id uuid,
  p_proof_id uuid,
  p_expected_revision bigint,
  p_idempotency_key uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_note text,
  p_assign_animal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_proof public.sponsorship_payment_proof%rowtype;
  v_new_pledge_status text;
  v_new_review_status text;
  v_actor_admin_id uuid;
  v_allocation jsonb := null;
  v_assignment_id uuid := null;
  v_command jsonb;
  v_cached public.sponsorship_proof_review_command%rowtype;
  v_result jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_remaining bigint;
  v_amount bigint;
  v_month date;
  v_period record;
  v_count integer := 0;
begin
  if not exists (
    select 1
    from public.admin_user
    where auth_user_id = p_actor_user_id
      and status = 'active'
      and role in ('treasurer', 'admin')
  ) then
    raise exception 'Actor % is not an active treasurer/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid review decision %', p_decision;
  end if;

  select *
  into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;

  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if p_proof_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_idempotency_key is null then
    raise exception 'Exact proof, revision and idempotency key are required';
  end if;
  v_command := jsonb_build_object('pledgeId',p_pledge_id,'proofId',p_proof_id,
    'revision',p_expected_revision,'decision',p_decision,'note',p_note);
  -- Actor/key lock also serializes accidental reuse across two pledges.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || p_idempotency_key::text, 712));
  select * into v_cached from public.sponsorship_proof_review_command
    where actor_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_cached.command <> v_command then return jsonb_build_object('kind','conflict'); end if;
    return v_cached.result || jsonb_build_object('replayed',true);
  end if;
  select * into v_proof from public.sponsorship_payment_proof
    where id=p_proof_id and pledge_id=p_pledge_id for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if v_proof.revision <> p_expected_revision or v_proof.review_status <> 'pending' then
    return jsonb_build_object('kind','conflict');
  end if;

  -- Every ledger command holds the pledge before proof/allocation locks.
  -- Read outstanding balances only after obtaining that shared serialization lock.
  if p_decision = 'approve' then
    v_remaining := v_proof.amount_cents;
    for v_period in
      select p.period_month, greatest(0,p.committed_cents-coalesce(sum(a.amount_cents),0)) outstanding
      from public.sponsorship_period p left join public.sponsorship_payment_allocation a on a.period_id=p.id
      where p.pledge_id=p_pledge_id group by p.id order by p.period_month
    loop
      v_amount := least(v_remaining,v_period.outstanding);
      if v_amount > 0 then
        v_allocations := v_allocations || jsonb_build_object('periodMonth',v_period.period_month,'amountCents',v_amount);
        v_remaining := v_remaining-v_amount;
      end if;
      exit when v_remaining=0;
    end loop;
    select greatest(date_trunc('month',v_proof.payment_date)::date,
      coalesce((max(period_month)+interval '1 month')::date,date_trunc('month',v_proof.payment_date)::date))
      into v_month from public.sponsorship_period where pledge_id=p_pledge_id;
    while v_remaining > 0 and v_count < 24 loop
      v_amount := least(v_remaining,v_pledge.amount_cents);
      v_allocations := v_allocations || jsonb_build_object('periodMonth',v_month,'amountCents',v_amount);
      v_remaining := v_remaining-v_amount;
      v_month := (v_month+interval '1 month')::date;
      v_count := v_count+1;
    end loop;
    if v_remaining <> 0 then raise exception 'Payment exceeds the supported 24 future months'; end if;
  end if;

  if p_decision = 'approve' then
    v_new_review_status := 'approved';
    v_new_pledge_status := 'active';
  else
    v_new_review_status := 'rejected';
    -- 'needs_followup' is reachable from both directions and still permits a
    -- corrected proof, so a rejected month flags staff follow-up without
    -- cancelling a sponsorship whose earlier months were paid.
    v_new_pledge_status := 'needs_followup';
  end if;

  update public.sponsorship_payment_proof
  set
    review_status = v_new_review_status,
    reviewed_by = (select id from public.admin_user where auth_user_id = p_actor_user_id),
    reviewed_at = now(),
    review_note = p_note
  where id = v_proof.id;

  update public.sponsorship_pledge
  set status = case when status='cancelled' then status else v_new_pledge_status end
  where id = p_pledge_id;

  -- CHANGE 2: resolve the actor's admin id once, unconditionally, rather than
  -- inside the allocation branch below where the 20260911190000 definition
  -- resolved it. Not a bug fix -- its only consumer sits inside that same
  -- branch, so the value was never read before it was set -- just tidying, so
  -- it no longer depends on which branch runs.
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id;

  -- Attribute the verified payment to months in the SAME transaction that
  -- approves it. Two transactions would leave a window in which money is
  -- approved but attributed to no month, and a crash inside that window would
  -- make it permanent; section 3.1 puts financial consistency in the database
  -- transaction. If any allocation violates an invariant, the approval rolls
  -- back with it and the caller retries -- nothing is half-applied.
  --
  -- A rejected proof allocates nothing: money that was refused was never
  -- received.
  if p_decision = 'approve' and v_allocations is not null
     and jsonb_array_length(v_allocations) > 0 then
    v_allocation := private.apply_sponsorship_allocations(
      v_proof.id, v_actor_admin_id, v_allocations
    );
  end if;

  -- CHANGE 3: confirm the supporter's animal on the FIRST approval only.
  -- "First" means the pledge has never had an assignment -- not that it has
  -- none open now. A supporter whose animal was adopted, and whose assignment
  -- staff ended, must be given a new animal by a person rather than silently
  -- by the next payment.
  --
  -- If the animal the caller chose has become ineligible since they chose it,
  -- assign_sponsorship_animal_with_audit raises and the ENTIRE approval rolls
  -- back -- deliberately: approving the payment while silently skipping the
  -- assignment would leave a paying supporter with no animal and no signal
  -- that anything went wrong. The caller re-reads state on retry and picks
  -- the next eligible choice.
  if p_decision = 'approve' and v_pledge.status <> 'cancelled' and p_assign_animal_id is not null
     and not exists (
       select 1 from public.sponsorship_assignment where pledge_id = p_pledge_id
     ) then
    v_assignment_id := public.assign_sponsorship_animal_with_audit(
      p_pledge_id, p_assign_animal_id, p_actor_user_id, null
    );
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'sponsorship_pledge.proof_reviewed',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object(
      'proofId', v_proof.id,
      'decision', p_decision,
      'note', p_note,
      'allocation', v_allocation,
      'assignmentId', v_assignment_id
    )
  );
  select revision into v_proof.revision from public.sponsorship_payment_proof where id=p_proof_id;
  v_result := jsonb_build_object('kind','reviewed','proofId',p_proof_id,'revision',v_proof.revision,
    'decision',p_decision,'allocations',coalesce(v_allocation->'allocations','[]'::jsonb),'assignmentId',v_assignment_id);
  insert into public.sponsorship_proof_review_command(actor_user_id,idempotency_key,command,result)
    values(p_actor_user_id,p_idempotency_key,v_command,v_result);
  return v_result;
end;
$fn$;
create or replace function public.allocate_sponsorship_payment_with_audit(
  p_proof_id uuid,
  p_actor_user_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_admin_id uuid;
  v_proof public.sponsorship_payment_proof%rowtype;
  v_result jsonb;
begin
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('treasurer', 'admin');
  if v_actor_admin_id is null then
    raise exception 'Actor % is not an active treasurer/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  select * into v_proof from public.sponsorship_payment_proof where id = p_proof_id;
  if not found then
    raise exception 'Payment proof % not found', p_proof_id;
  end if;

  perform 1 from public.sponsorship_pledge where id=v_proof.pledge_id for update;

  v_result := private.apply_sponsorship_allocations(p_proof_id, v_actor_admin_id, p_allocations);

  if v_result ->> 'status' = 'allocated' then
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor_user_id,
      'sponsorship_pledge.payment_allocated',
      'sponsorship_pledge',
      v_proof.pledge_id::text,
      jsonb_build_object(
        'proofId', p_proof_id,
        'paymentCents', v_proof.amount_cents,
        'allocatedCents', v_result -> 'allocatedCents',
        'allocations', v_result -> 'allocations'
      )
    );
  end if;

  return v_result;
end;
$fn$;
create or replace function public.reverse_sponsorship_allocation_with_audit(
  p_allocation_id uuid,
  p_actor_user_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.sponsorship_payment_allocation%rowtype;
  v_period public.sponsorship_period%rowtype;
  v_actor_admin_id uuid;
  v_reversal_id uuid;
  v_net integer;
begin
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('treasurer', 'admin');
  if v_actor_admin_id is null then
    raise exception 'Actor % is not an active treasurer/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  perform 1 from public.sponsorship_pledge where id=(
    select p.pledge_id from public.sponsorship_payment_allocation a
    join public.sponsorship_period p on p.id=a.period_id where a.id=p_allocation_id
  ) for update;

  select * into v_original
  from public.sponsorship_payment_allocation
  where id = p_allocation_id
  for update;
  if not found then
    raise exception 'Allocation % not found', p_allocation_id;
  end if;

  if v_original.reverses_allocation_id is not null then
    raise exception 'Allocation % is itself a reversal', p_allocation_id;
  end if;

  -- Reversing the same entry twice would take back more than was ever put in.
  select coalesce(sum(amount_cents), 0) into v_net
  from public.sponsorship_payment_allocation
  where reverses_allocation_id = p_allocation_id;

  if v_original.amount_cents + v_net <= 0 then
    raise exception 'Allocation % has already been reversed', p_allocation_id;
  end if;

  select * into v_period from public.sponsorship_period where id = v_original.period_id;

  insert into public.sponsorship_payment_allocation (
    period_id, proof_id, amount_cents, reverses_allocation_id, note, created_by
  ) values (
    v_original.period_id,
    v_original.proof_id,
    -(v_original.amount_cents + v_net),
    p_allocation_id,
    p_note,
    v_actor_admin_id
  )
  returning id into v_reversal_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'sponsorship_pledge.allocation_reversed',
    'sponsorship_pledge',
    v_period.pledge_id::text,
    jsonb_build_object(
      'allocationId', p_allocation_id,
      'reversalId', v_reversal_id,
      'proofId', v_original.proof_id,
      'periodMonth', v_period.period_month,
      'reversedCents', v_original.amount_cents + v_net,
      'note', p_note
    )
  );

  return v_reversal_id;
end;
$$;
create or replace function public.claim_sponsorship_deliveries(p_actor uuid,p_limit integer default 10,p_pledge uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('admin','staff','treasurer')) then raise exception 'Coordinator required' using errcode='42501'; end if;
 with candidates as (select id from public.sponsorship_delivery_outbox where (p_pledge is null or pledge_id=p_pledge) and next_attempt_at<=now() and (status in ('queued','failed') or (status='processing' and lease_until<now())) order by created_at for update skip locked limit least(greatest(p_limit,1),25)),
 claimed as (update public.sponsorship_delivery_outbox o set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from candidates c where o.id=c.id returning o.*)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('supporterEmail',c.recipient_email,'supporterName',c.recipient_name,'language',c.language,'amountCents',c.amount_cents)),'[]'::jsonb) into v_result
 from claimed c join public.sponsorship_pledge p on p.id=c.pledge_id join public.supporter s on s.id=p.supporter_id left join public.sponsorship_payment_proof proof on proof.id=c.proof_id;
 return v_result;
end; $$;
create or replace function public.finish_sponsorship_delivery(p_actor uuid,p_id uuid,p_lease uuid,p_provider_id text,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.sponsorship_delivery_outbox%rowtype;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('admin','staff','treasurer')) then raise exception 'Coordinator required' using errcode='42501'; end if;
 select * into v_row from public.sponsorship_delivery_outbox where id=p_id and status='processing' and lease_token=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 if p_error is null and nullif(p_provider_id,'') is null then raise exception 'Provider acceptance id required'; end if;
 update public.sponsorship_delivery_outbox set status=case when p_error is null then 'sent' else 'failed' end,provider_message_id=p_provider_id,last_error=left(p_error,300),sent_at=case when p_error is null then now() else null end,next_attempt_at=now()+interval '5 minutes',lease_token=null,lease_until=null where id=p_id;
 update public.message set status=case when p_error is null then 'sent' else 'failed' end,sent_at=case when p_error is null then now() else null end where id=v_row.message_id;
 return true;
end; $$;
create function public.search_sponsorship_assignment_candidates(p_actor uuid,p_query text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('staff','admin')) then raise exception 'Programme coordinator required' using errcode='42501';end if;
 if length(coalesce(p_query,''))>100 then raise exception 'Search is too long';end if;
 select coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) into v_result from (
 select a.id,a.name,a.name_en,a.public_profile->>'code' code,a.image_url
 from public.animals a left join public.animal_profile_internal i on i.animal_id=a.id
 where a.sponsorship_eligible and a.publication_state='published' and a.retired_at is null and a.status<>'adopted' and i.deceased_at is null and i.adopted_at is null
 and (coalesce(p_query,'')='' or a.name ilike '%'||p_query||'%' or a.name_en ilike '%'||p_query||'%' or a.public_profile->>'code' ilike '%'||p_query||'%')
 order by a.name,a.id limit 30) candidate;
 return v_result;
end; $$;
revoke all on function public.search_sponsorship_assignment_candidates(uuid,text) from public,anon,authenticated;
grant execute on function public.search_sponsorship_assignment_candidates(uuid,text) to service_role;
