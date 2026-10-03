-- A staff upload may be shared by concurrent retries. Defer deletion until no
-- committed proof can reference the object, rather than deleting on an RPC error.
create table public.sponsorship_staff_proof_upload_intent (
  storage_path text primary key,
  pledge_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  attached_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint sponsorship_staff_proof_upload_path
    check (storage_path like pledge_id::text || '/staff-%'),
  constraint sponsorship_staff_proof_upload_expiry
    check (expires_at > created_at)
);

create index sponsorship_staff_proof_upload_cleanup_idx
  on public.sponsorship_staff_proof_upload_intent (expires_at)
  where attached_at is null;

alter table public.sponsorship_staff_proof_upload_intent enable row level security;
revoke all on public.sponsorship_staff_proof_upload_intent from public, anon, authenticated;
grant select, insert, update, delete on public.sponsorship_staff_proof_upload_intent to service_role;

create function public.reserve_staff_sponsorship_proof_upload(
  p_pledge_id uuid,
  p_storage_path text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text;
begin
  if p_pledge_id is null or p_storage_path is null then
    raise exception 'invalid_staff_proof_upload_intent' using errcode = '22023';
  end if;

  insert into public.sponsorship_staff_proof_upload_intent (
    storage_path, pledge_id, expires_at
  ) values (
    p_storage_path, p_pledge_id, pg_catalog.clock_timestamp() + interval '1 day'
  )
  on conflict (storage_path) do update
  set expires_at = greatest(
    public.sponsorship_staff_proof_upload_intent.expires_at,
    excluded.expires_at
  )
  where public.sponsorship_staff_proof_upload_intent.pledge_id = excluded.pledge_id
    and public.sponsorship_staff_proof_upload_intent.cleanup_claimed_at is null
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'staff_proof_upload_cleanup_in_progress' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.reserve_staff_sponsorship_proof_upload(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_staff_sponsorship_proof_upload(uuid, text)
  to service_role;

create function public.mark_staff_sponsorship_proof_attached()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claimed_at timestamptz;
begin
  if new.storage_path is null
    or new.storage_path not like new.pledge_id::text || '/staff-%' then
    return new;
  end if;

  select intent.cleanup_claimed_at into v_claimed_at
  from public.sponsorship_staff_proof_upload_intent as intent
  where intent.storage_path = new.storage_path
    and intent.pledge_id = new.pledge_id
  for update;

  if found then
    if v_claimed_at is not null then
      raise exception 'staff proof upload is being cleaned up' using errcode = '55000';
    end if;
    update public.sponsorship_staff_proof_upload_intent
    set attached_at = pg_catalog.clock_timestamp()
    where storage_path = new.storage_path;
  end if;
  return new;
end;
$$;

revoke all on function public.mark_staff_sponsorship_proof_attached()
  from public, anon, authenticated;
grant execute on function public.mark_staff_sponsorship_proof_attached()
  to service_role;

create trigger sponsorship_staff_proof_attached
  after insert on public.sponsorship_payment_proof
  for each row execute function public.mark_staff_sponsorship_proof_attached();

create function public.claim_expired_staff_sponsorship_proof_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (pledge_id uuid, storage_path text, claimed_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select intent.storage_path
    from public.sponsorship_staff_proof_upload_intent as intent
    where intent.attached_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at, intent.storage_path
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.sponsorship_staff_proof_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.storage_path = candidates.storage_path
  returning intent.pledge_id, intent.storage_path, intent.cleanup_claimed_at;
$$;

revoke all on function public.claim_expired_staff_sponsorship_proof_uploads(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_staff_sponsorship_proof_uploads(timestamptz, integer)
  to service_role;
