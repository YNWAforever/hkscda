-- Application-owned recovery code; provider carrier never leaves the server.
-- Additive only. No Auth schema patch, supporter linking, email schedule or backfill.
create table private.supporter_recovery_challenge (
  id uuid primary key,
  purpose text not null default 'supporter-recovery-v1' check (purpose = 'supporter-recovery-v1'),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email_fingerprint text not null check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  code_fingerprint text not null check (code_fingerprint ~ '^[0-9a-f]{64}$'),
  sealed_carrier text check (sealed_carrier is null or (length(sealed_carrier) between 40 and 4096)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check (consumed_at is null or sealed_carrier is null)
);
alter table private.supporter_recovery_challenge enable row level security;
revoke all on private.supporter_recovery_challenge from public, anon, authenticated, service_role;
create index supporter_recovery_challenge_expiry on private.supporter_recovery_challenge(expires_at);

create function public.create_supporter_recovery_challenge(
  p_id uuid, p_auth_user_id uuid, p_email_fingerprint text,
  p_code_fingerprint text, p_sealed_carrier text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or p_auth_user_id is null or p_email_fingerprint is null
    or p_code_fingerprint is null or p_sealed_carrier is null
    or p_email_fingerprint !~ '^[0-9a-f]{64}$' or p_code_fingerprint !~ '^[0-9a-f]{64}$'
    or length(p_sealed_carrier) not between 40 and 4096 then
    raise exception 'Invalid recovery challenge' using errcode = '22023';
  end if;
  -- Opportunistic expiry only; does not reset any live challenge or add a cron.
  delete from private.supporter_recovery_challenge where expires_at <= now();
  insert into private.supporter_recovery_challenge(id,auth_user_id,email_fingerprint,code_fingerprint,sealed_carrier)
    values (p_id,p_auth_user_id,p_email_fingerprint,p_code_fingerprint,p_sealed_carrier);
end;
$$;

create function public.consume_supporter_recovery_challenge(
  p_id uuid, p_email_fingerprint text, p_code_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row private.supporter_recovery_challenge%rowtype;
begin
  select * into v_row from private.supporter_recovery_challenge where id = p_id for update;
  if not found or v_row.purpose <> 'supporter-recovery-v1'
    or p_email_fingerprint is null or p_code_fingerprint is null
    or v_row.email_fingerprint <> p_email_fingerprint or v_row.expires_at <= pg_catalog.clock_timestamp()
    or v_row.consumed_at is not null or v_row.attempts >= 5 or v_row.sealed_carrier is null then
    return null;
  end if;
  if v_row.code_fingerprint <> p_code_fingerprint then
    update private.supporter_recovery_challenge set attempts = attempts + 1,
      sealed_carrier = case when attempts + 1 >= 5 then null else sealed_carrier end
      where id = p_id;
    return null;
  end if;
  update private.supporter_recovery_challenge set consumed_at = pg_catalog.clock_timestamp(), sealed_carrier = null where id = p_id;
  return jsonb_build_object('userId',v_row.auth_user_id,'sealedCarrier',v_row.sealed_carrier);
end;
$$;

create function public.invalidate_supporter_recovery_challenge(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update private.supporter_recovery_challenge set consumed_at = now(), sealed_carrier = null
    where id = p_id and consumed_at is null;
$$;

revoke all on function public.create_supporter_recovery_challenge(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.consume_supporter_recovery_challenge(uuid,text,text) from public,anon,authenticated;
revoke all on function public.invalidate_supporter_recovery_challenge(uuid) from public,anon,authenticated;
grant execute on function public.create_supporter_recovery_challenge(uuid,uuid,text,text,text) to service_role;
grant execute on function public.consume_supporter_recovery_challenge(uuid,text,text) to service_role;
grant execute on function public.invalidate_supporter_recovery_challenge(uuid) to service_role;
