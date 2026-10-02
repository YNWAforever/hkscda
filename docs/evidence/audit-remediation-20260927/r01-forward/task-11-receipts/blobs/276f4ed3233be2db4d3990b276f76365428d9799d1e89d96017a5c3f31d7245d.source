do $$
begin
  if exists (
    select 1
    from public.message
    where channel = 'email'
      and payload ->> 'kind' = 'volunteer_registration_confirmation'
    group by payload ->> 'registrationId'
    having count(*) > 1
  ) then
    raise exception 'Volunteer registration message duplicates require authorized remediation before this migration can continue';
  end if;
end
$$;
create unique index if not exists message_volunteer_registration_unique
  on public.message ((payload ->> 'registrationId'))
  where channel = 'email' and payload ->> 'kind' = 'volunteer_registration_confirmation';
alter table public.donation
  add column if not exists contact_name text,
  add column if not exists contact_email citext,
  add column if not exists contact_phone text,
  add column if not exists contact_language text,
  add column if not exists consent_email_requested boolean not null default false,
  add column if not exists consent_whatsapp_requested boolean not null default false;

alter table public.donation drop constraint if exists donation_contact_language_check;
alter table public.donation add constraint donation_contact_language_check
  check (contact_language is null or contact_language in ('zh-HK', 'en'));
alter table public.donation drop constraint if exists donation_contact_snapshot_length_check;
alter table public.donation add constraint donation_contact_snapshot_length_check check (
  (contact_name is null or (char_length(contact_name) between 1 and 120)) and
  (contact_email is null or char_length(contact_email::text) <= 254) and
  (contact_phone is null or char_length(contact_phone) <= 40)
);

alter table public.volunteer_registration
  add column if not exists consent_email_requested boolean not null default false,
  add column if not exists consent_whatsapp_requested boolean not null default false;

create table if not exists public.supporter_consent_intent (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  requested_status text not null default 'opt_in' check (requested_status = 'opt_in'),
  source text not null check (source in ('donation_form', 'volunteer_registration_form')),
  submission_type text not null check (submission_type in ('donation', 'volunteer_registration')),
  submission_id uuid not null,
  requested_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (submission_type, submission_id, channel)
);

alter table public.supporter_consent_intent enable row level security;
revoke all on table public.supporter_consent_intent from public, anon, authenticated;
grant select, insert on table public.supporter_consent_intent to service_role;

create index if not exists supporter_consent_intent_supporter_requested_idx
  on public.supporter_consent_intent (supporter_id, requested_at desc);
create index if not exists supporter_consent_intent_submission_idx
  on public.supporter_consent_intent (submission_type, submission_id);

create or replace function public.resolve_public_supporter_identity(p_contact jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_contact->>'name', ''));
  v_email citext := lower(btrim(coalesce(p_contact->>'email', '')))::citext;
  v_phone text := nullif(btrim(coalesce(p_contact->>'phone', '')), '');
  v_language text := p_contact->>'language';
  v_source text := p_contact->>'source';
  v_supporter_id uuid;
begin
  if v_name = '' or char_length(v_name) > 120 or v_email = '' or char_length(v_email::text) > 254 then
    raise exception 'Public contact name and email are required' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Invalid public contact phone' using errcode = '22023';
  end if;
  if v_language is null or v_language not in ('zh-HK', 'en') then
    raise exception 'Invalid public contact language' using errcode = '22023';
  end if;
  if v_source is null or v_source not in ('donation_form', 'volunteer_registration_form') then
    raise exception 'Invalid public contact source' using errcode = '22023';
  end if;

  insert into public.supporter (name, email, phone, language, source)
  values (v_name, v_email, v_phone, v_language, v_source)
  on conflict (email) do nothing
  returning id into v_supporter_id;

  if v_supporter_id is not null then
    return jsonb_build_object('supporterId', v_supporter_id, 'kind', 'created');
  end if;

  select id into v_supporter_id from public.supporter where email = v_email;
  if v_supporter_id is null then
    raise exception 'Public supporter identity resolution failed' using errcode = 'P0001';
  end if;
  return jsonb_build_object('supporterId', v_supporter_id, 'kind', 'existing');
end;
$$;

revoke all on function public.resolve_public_supporter_identity(jsonb) from public, anon, authenticated;
grant execute on function public.resolve_public_supporter_identity(jsonb) to service_role;

create or replace function public.record_public_consent_intents()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_submission_type text;
begin
  if tg_table_name = 'donation' then
    v_source := 'donation_form';
    v_submission_type := 'donation';
  elsif tg_table_name = 'volunteer_registration' then
    v_source := 'volunteer_registration_form';
    v_submission_type := 'volunteer_registration';
  else
    raise exception 'Unsupported public consent-intent source table';
  end if;

  if new.consent_email_requested then
    insert into public.supporter_consent_intent (
      supporter_id, channel, source, submission_type, submission_id, requested_at
    ) values (
      new.supporter_id, 'email', v_source, v_submission_type, new.id, new.created_at
    ) on conflict (submission_type, submission_id, channel) do nothing;
  end if;

  if new.consent_whatsapp_requested then
    insert into public.supporter_consent_intent (
      supporter_id, channel, source, submission_type, submission_id, requested_at
    ) values (
      new.supporter_id, 'whatsapp', v_source, v_submission_type, new.id, new.created_at
    ) on conflict (submission_type, submission_id, channel) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_public_consent_intents() from public, anon, authenticated;
grant execute on function public.record_public_consent_intents() to service_role;

drop trigger if exists record_public_consent_intents on public.donation;
create trigger record_public_consent_intents after insert on public.donation
for each row execute function public.record_public_consent_intents();

drop trigger if exists record_public_consent_intents on public.volunteer_registration;
create trigger record_public_consent_intents after insert on public.volunteer_registration
for each row execute function public.record_public_consent_intents();

create or replace function public.create_volunteer_registration(
  p_activity_id uuid,
  p_supporter_id uuid,
  p_registration_type text,
  p_participant_count integer,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_language text,
  p_organization_name text,
  p_declared_age integer,
  p_youngest_age integer,
  p_guardian_name text,
  p_guardian_phone text,
  p_notes text,
  p_status_token_hash text,
  p_status_token_expires_at timestamptz,
  p_consent_email_requested boolean,
  p_consent_whatsapp_requested boolean
) returns public.volunteer_registration
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registration public.volunteer_registration%rowtype;
begin
  v_registration := public.create_volunteer_registration(
    p_activity_id,
    p_supporter_id,
    p_registration_type,
    p_participant_count,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_language,
    p_organization_name,
    p_declared_age,
    p_youngest_age,
    p_guardian_name,
    p_guardian_phone,
    p_notes,
    p_status_token_hash,
    p_status_token_expires_at
  );

  update public.volunteer_registration
  set consent_email_requested = p_consent_email_requested,
      consent_whatsapp_requested = p_consent_whatsapp_requested
  where id = v_registration.id
  returning * into v_registration;

  if p_consent_email_requested then
    insert into public.supporter_consent_intent (
      supporter_id, channel, source, submission_type, submission_id, requested_at
    ) values (
      v_registration.supporter_id,
      'email',
      'volunteer_registration_form',
      'volunteer_registration',
      v_registration.id,
      v_registration.created_at
    ) on conflict (submission_type, submission_id, channel) do nothing;
  end if;

  if p_consent_whatsapp_requested then
    insert into public.supporter_consent_intent (
      supporter_id, channel, source, submission_type, submission_id, requested_at
    ) values (
      v_registration.supporter_id,
      'whatsapp',
      'volunteer_registration_form',
      'volunteer_registration',
      v_registration.id,
      v_registration.created_at
    ) on conflict (submission_type, submission_id, channel) do nothing;
  end if;

  return v_registration;
end;
$$;

revoke all on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) to service_role;
