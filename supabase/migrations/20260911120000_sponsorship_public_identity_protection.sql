-- Route unverified public sponsorship submissions through the same protected
-- public-identity path that donations and volunteer registrations already use.
--
-- Before this migration the sponsorship form was the one public entry point that
-- wrote the supporter master record directly:
--   .from("supporter").upsert({name,email,phone,language,source},{onConflict:"email"})
-- On an email conflict Postgres UPDATEs every listed column, so an unverified
-- stranger submitting a pledge with an existing supporter's email silently
-- overwrote that supporter's real name, phone, language and source. The same code
-- path inserted consent rows without filtering to opt_out, so the submission could
-- also flip a previously recorded opt_out into opt_in.
--
-- resolve_public_supporter_identity already solves this correctly for the other two
-- forms: it inserts with `on conflict (email) do nothing` and never updates an
-- existing row. This migration widens that function (and the consent-intent ledger
-- it feeds) to accept sponsorship, so the application can stop writing the master
-- record itself.
--
-- Additive and forward-only: no existing row is modified, no column is dropped, and
-- the previously-accepted source values keep working. Re-running is safe.

-- 1. Consent *intent* ledger accepts sponsorship pledges.
--    These record that a public form ticked an opt-in box. They are evidence of a
--    request, never consent state; promoting an intent into consent still requires
--    staff verification.
alter table public.supporter_consent_intent
  drop constraint if exists supporter_consent_intent_source_check;
alter table public.supporter_consent_intent
  add constraint supporter_consent_intent_source_check
  check (source in ('donation_form', 'volunteer_registration_form', 'sponsorship_pledge_form'));

alter table public.supporter_consent_intent
  drop constraint if exists supporter_consent_intent_submission_type_check;
alter table public.supporter_consent_intent
  add constraint supporter_consent_intent_submission_type_check
  check (submission_type in ('donation', 'volunteer_registration', 'sponsorship_pledge'));

-- 2. The pledge carries the requested opt-ins so the existing trigger can record
--    them, mirroring donation.consent_*_requested. Defaulting to false keeps every
--    historical pledge unchanged and asserts nothing about what those supporters
--    were asked.
alter table public.sponsorship_pledge
  add column if not exists consent_email_requested boolean not null default false;
alter table public.sponsorship_pledge
  add column if not exists consent_whatsapp_requested boolean not null default false;

comment on column public.sponsorship_pledge.consent_email_requested is
  'The public pledge form ticked the email opt-in box. A request, not consent state.';
comment on column public.sponsorship_pledge.consent_whatsapp_requested is
  'The public pledge form ticked the WhatsApp opt-in box. A request, not consent state.';

-- 3. Accept sponsorship as a public identity source. The conflict behaviour is
--    unchanged and is the whole point: `on conflict (email) do nothing` means an
--    existing supporter's name/phone/language/source are never overwritten.
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
  if v_source is null or v_source not in ('donation_form', 'volunteer_registration_form', 'sponsorship_pledge_form') then
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

-- 4. Teach the existing intent trigger about sponsorship pledges. Donation and
--    volunteer_registration behaviour is reproduced verbatim.
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
  elsif tg_table_name = 'sponsorship_pledge' then
    v_source := 'sponsorship_pledge_form';
    v_submission_type := 'sponsorship_pledge';
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

drop trigger if exists record_public_consent_intents on public.sponsorship_pledge;
create trigger record_public_consent_intents after insert on public.sponsorship_pledge
for each row execute function public.record_public_consent_intents();
