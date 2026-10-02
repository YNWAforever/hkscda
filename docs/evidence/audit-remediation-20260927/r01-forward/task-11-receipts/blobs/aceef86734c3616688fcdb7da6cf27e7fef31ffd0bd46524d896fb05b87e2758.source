-- Capture approved public instructions at atomic checkout admission.
-- Empty legacy admissions remain historical and are never converted to invented details.
alter table public.checkout_admission
  add column instruction_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.admit_new_checkout(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_method text,
  p_purpose text,
  p_expected_config_version integer
)
returns jsonb
language plpgsql
-- Admission locks policy rows while direct service policy writes stay revoked.
security definer
set search_path = public, pg_temp
as $$
declare
  prior public.checkout_admission%rowtype;
  current_policy public.checkout_policy%rowtype;
  approval public.checkout_method_approval%rowtype;
  config public.payment_public_config%rowtype;
begin
  if p_idempotency_key is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_method not in ('stripe', 'payme', 'fps', 'paypal', 'alipayhk')
    or p_purpose not in ('donation', 'sponsorship')
    or p_expected_config_version is null or p_expected_config_version < 1
  then
    raise exception 'Invalid checkout admission request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into prior from public.checkout_admission
    where idempotency_key = p_idempotency_key for update;
  if found then
    if prior.request_fingerprint <> p_request_fingerprint
      or prior.method <> p_method or prior.purpose <> p_purpose
      or prior.config_version <> p_expected_config_version
    then
      raise exception 'Checkout admission conflicts with an earlier intent' using errcode = 'P5104';
    end if;
    return jsonb_build_object('config_id', prior.config_id,
      'config_version', prior.config_version, 'policy_version', prior.policy_version,
      'instruction_snapshot', prior.instruction_snapshot,
      'instructions_active', exists (
        select 1 from public.checkout_policy cp
        join public.checkout_method_approval ca
          on ca.method = prior.method and ca.purpose = prior.purpose
        join public.payment_public_config pc on pc.id = ca.config_id
        where cp.singleton = true and cp.enabled and ca.enabled
          and ca.config_id = prior.config_id
          and ca.config_version = prior.config_version
          and pc.version = prior.config_version and pc.state = 'published'
          and pc.is_publicly_visible and pc.published_by is not null
      ), 'existing', true);
  end if;

  select * into current_policy from public.checkout_policy
    where singleton = true for share;
  if not found or not current_policy.enabled then
    raise exception 'New checkout is disabled' using errcode = 'P5101';
  end if;

  select * into approval from public.checkout_method_approval
    where method = p_method and purpose = p_purpose for share;
  if not found or not approval.enabled then
    raise exception 'Checkout method is unavailable' using errcode = 'P5102';
  end if;
  if approval.config_version <> p_expected_config_version then
    raise exception 'Checkout configuration has changed' using errcode = 'P5103';
  end if;

  select * into config from public.payment_public_config
    where id = approval.config_id for share;
  if not found or config.method <> p_method or config.state <> 'published'
    or not config.is_publicly_visible or config.published_by is null then
    raise exception 'Checkout method is unavailable' using errcode = 'P5102';
  end if;
  if config.version <> approval.config_version then
    raise exception 'Checkout configuration has changed' using errcode = 'P5103';
  end if;

  if p_method in ('fps', 'payme') and (
    nullif(btrim(config.details->>'payableTo'), '') is null
    or nullif(btrim(config.details->>'identifier'), '') is null
  ) then
    raise exception 'Manual payment instructions are incomplete' using errcode = 'P5102';
  end if;

  insert into public.checkout_admission
    (idempotency_key, request_fingerprint, method, purpose, config_id, config_version,
      policy_version, instruction_snapshot)
  values (p_idempotency_key, p_request_fingerprint, p_method, p_purpose,
    config.id, config.version, current_policy.version,
    jsonb_build_object('configId', config.id, 'configVersion', config.version,
      'purpose', p_purpose, 'method', p_method,
      'displayLabelZh', config.display_label_zh,
      'displayLabelEn', config.display_label_en,
      'details', config.details, 'capturedAt', now()));

  return jsonb_build_object('config_id', config.id,
    'config_version', config.version, 'policy_version', current_policy.version,
    'instruction_snapshot', (select instruction_snapshot from public.checkout_admission
      where idempotency_key = p_idempotency_key),
    'instructions_active', true, 'existing', false);
end;
$$;

-- Sponsorship instructions are captured for each pledge; a resend only exposes
-- rows whose approval and current published version still match the snapshot.
create table public.sponsorship_payment_instruction_snapshot (
  pledge_id uuid not null references public.sponsorship_pledge(id) on delete restrict,
  method text not null check (method in ('stripe', 'payme', 'fps', 'paypal', 'alipayhk')),
  config_id uuid not null references public.payment_public_config(id) on delete restrict,
  config_version integer not null check (config_version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  captured_at timestamptz not null default now(),
  primary key (pledge_id, method)
);
alter table public.sponsorship_payment_instruction_snapshot enable row level security;
revoke all on public.sponsorship_payment_instruction_snapshot from public, anon, authenticated;
grant select on public.sponsorship_payment_instruction_snapshot to service_role;

create function public.capture_sponsorship_payment_instructions(p_pledge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_policy public.checkout_policy%rowtype;
  candidate record;
  inserted_count integer := 0;
  result jsonb;
begin
  if p_pledge_id is null or not exists (
    select 1 from public.sponsorship_pledge where id = p_pledge_id
  ) then
    raise exception 'Sponsorship pledge not found' using errcode = 'P0002';
  end if;
  select * into current_policy from public.checkout_policy
    where singleton = true for share;
  if not found or not current_policy.enabled then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1 from public.sponsorship_payment_instruction_snapshot
    where pledge_id = p_pledge_id
  ) then
    for candidate in
      select ca.method, ca.config_id, ca.config_version,
        pc.display_label_zh, pc.display_label_en, pc.details
      from public.checkout_method_approval ca
      join public.payment_public_config pc on pc.id = ca.config_id
      where ca.purpose = 'sponsorship' and ca.enabled
        and pc.method = ca.method and pc.state = 'published'
        and pc.is_publicly_visible and pc.published_by is not null
        and pc.version = ca.config_version
        and nullif(btrim(pc.details->>'payableTo'), '') is not null
        and nullif(btrim(pc.details->>'identifier'), '') is not null
      for share of ca, pc
    loop
      insert into public.sponsorship_payment_instruction_snapshot
        (pledge_id, method, config_id, config_version, snapshot)
      values (p_pledge_id, candidate.method, candidate.config_id,
        candidate.config_version,
        jsonb_build_object('configId', candidate.config_id,
          'configVersion', candidate.config_version,
          'purpose', 'sponsorship', 'method', candidate.method,
          'displayLabelZh', candidate.display_label_zh,
          'displayLabelEn', candidate.display_label_en,
          'details', candidate.details, 'capturedAt', now()))
      on conflict (pledge_id, method) do nothing;
      if found then inserted_count := inserted_count + 1; end if;
    end loop;
    if inserted_count > 0 then
      insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
      values (null, 'payment_instruction.capture', 'sponsorship_pledge',
        p_pledge_id::text, jsonb_build_object('methods', inserted_count));
    end if;
  end if;

  select coalesce(jsonb_agg(s.snapshot order by s.method), '[]'::jsonb) into result
  from public.sponsorship_payment_instruction_snapshot s
  join public.checkout_method_approval ca on ca.method = s.method
    and ca.purpose = 'sponsorship' and ca.enabled
    and ca.config_id = s.config_id and ca.config_version = s.config_version
  join public.payment_public_config pc on pc.id = s.config_id
    and pc.method = s.method and pc.version = s.config_version
    and pc.state = 'published' and pc.is_publicly_visible
    and pc.published_by is not null and pc.details = s.snapshot->'details'
  where s.pledge_id = p_pledge_id;
  return result;
end;
$$;
revoke all on function public.capture_sponsorship_payment_instructions(uuid)
  from public, anon, authenticated;
grant execute on function public.capture_sponsorship_payment_instructions(uuid)
  to service_role;

-- Approval itself must reject a manual method lacking public account details.
-- Disabling an existing approval remains allowed even if its config was withdrawn.
create function public.guard_manual_checkout_approval()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  instruction_details jsonb;
begin
  if not new.enabled or new.method not in ('fps', 'payme') then
    return new;
  end if;
  select details into instruction_details
  from public.payment_public_config where id = new.config_id;
  if nullif(btrim(instruction_details->>'payableTo'), '') is null
    or nullif(btrim(instruction_details->>'identifier'), '') is null then
    raise exception 'Manual checkout instructions are incomplete' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger checkout_method_manual_details_guard
before insert or update on public.checkout_method_approval
for each row execute function public.guard_manual_checkout_approval();
revoke all on function public.guard_manual_checkout_approval()
  from public, anon, authenticated;
