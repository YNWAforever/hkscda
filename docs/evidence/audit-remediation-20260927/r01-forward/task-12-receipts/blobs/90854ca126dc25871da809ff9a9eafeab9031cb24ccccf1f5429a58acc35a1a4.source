-- The public API submits one stable 256-bit token per logical registration.
-- A transaction lock and the existing unique status-token hash make concurrent
-- transport retries return the original row without consuming capacity twice.
create or replace function public.create_volunteer_registration_idempotent(
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
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.volunteer_registration%rowtype;
  v_registration public.volunteer_registration%rowtype;
begin
  if p_status_token_hash is null or p_status_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_volunteer_submission_token' using errcode = '22023';
  end if;

  -- The underlying booking RPC uses the same domain lock. Take it first so
  -- two different submission tokens for one supporter cannot race.
  perform pg_advisory_xact_lock(hashtextextended('volunteer-domain', 0));
  perform pg_advisory_xact_lock(
    hashtextextended('volunteer-public-submission:' || p_status_token_hash, 0)
  );

  select * into v_previous
    from public.volunteer_registration
   where status_token_hash = p_status_token_hash
   for update;

  if found then
    if (v_previous.activity_id, v_previous.supporter_id,
        v_previous.registration_type, v_previous.participant_count,
        v_previous.contact_name, v_previous.contact_email, v_previous.contact_phone,
        v_previous.language, v_previous.organization_name, v_previous.declared_age,
        v_previous.youngest_age, v_previous.guardian_name, v_previous.guardian_phone,
        v_previous.notes, v_previous.consent_email_requested,
        v_previous.consent_whatsapp_requested)
       is distinct from
       (p_activity_id, p_supporter_id,
        p_registration_type, p_participant_count,
        p_contact_name, p_contact_email, p_contact_phone,
        p_language, p_organization_name, p_declared_age,
        p_youngest_age, p_guardian_name, p_guardian_phone,
        p_notes, p_consent_email_requested,
        p_consent_whatsapp_requested) then
      raise exception 'volunteer_submission_token_conflict' using errcode = '23505';
    end if;
    if v_previous.status_token_expires_at <= clock_timestamp() then
      raise exception 'volunteer_submission_token_expired' using errcode = '22023';
    end if;
    return jsonb_build_object('created', false, 'registration', to_jsonb(v_previous));
  end if;

  -- A fresh token must not create a second active registration for the same
  -- supporter and activity, including after the original token has expired.
  if p_supporter_id is not null and exists (
    select 1 from public.volunteer_registration
     where activity_id = p_activity_id
       and supporter_id = p_supporter_id
       and status in ('pending', 'approved', 'waitlisted')
  ) then
    raise exception 'volunteer_duplicate_active_registration' using errcode = '23505';
  end if;

  v_registration := public.create_volunteer_registration(
    p_activity_id, p_supporter_id, p_registration_type, p_participant_count,
    p_contact_name, p_contact_email, p_contact_phone, p_language,
    p_organization_name, p_declared_age, p_youngest_age, p_guardian_name,
    p_guardian_phone, p_notes, p_status_token_hash, p_status_token_expires_at,
    p_consent_email_requested, p_consent_whatsapp_requested
  );
  return jsonb_build_object('created', true, 'registration', to_jsonb(v_registration));
end;
$$;

revoke all on function public.create_volunteer_registration_idempotent(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.create_volunteer_registration_idempotent(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) to service_role;

-- A successful admin notification must stay deduplicated across registration
-- retries, while failed claims remain available for retry.
create unique index if not exists message_volunteer_registration_admin_unique
  on public.message ((payload ->> 'registrationId'))
  where channel = 'email'
    and payload ->> 'kind' = 'volunteer_registration_admin_notification';

-- Clone and its audit fact commit or roll back together.
create or replace function public.clone_volunteer_activity_with_audit(
  p_source_activity_id uuid,
  p_actor_user_id uuid,
  p_starts_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.volunteer_activity%rowtype;
  v_cloned_id uuid;
begin
  if not exists (
    select 1 from public.admin_user
     where auth_user_id = p_actor_user_id
       and status = 'active'
       and role in ('staff', 'admin')
  ) then
    raise exception 'volunteer_forbidden' using errcode = '42501';
  end if;

  select * into v_source
    from public.volunteer_activity
   where id = p_source_activity_id
   for share;
  if not found then
    raise exception 'Volunteer activity not found' using errcode = 'P0002';
  end if;

  insert into public.volunteer_activity (
    type, title, description, starts_at, ends_at, location, capacity,
    min_age, underage_policy, auto_approve, allow_waitlist, status,
    registration_modes
  ) values (
    v_source.type, v_source.title || ' copy', v_source.description,
    coalesce(p_starts_at, v_source.starts_at),
    case
      when p_starts_at is null then v_source.ends_at
      when v_source.ends_at is null then null
      else p_starts_at + (v_source.ends_at - v_source.starts_at)
    end,
    v_source.location, v_source.capacity, v_source.min_age,
    v_source.underage_policy, v_source.auto_approve, v_source.allow_waitlist,
    'draft', v_source.registration_modes
  ) returning id into v_cloned_id;

  insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id, 'volunteer_activity.clone', 'volunteer_activity',
    v_cloned_id::text, jsonb_build_object('sourceActivityId', p_source_activity_id)
  );

  return v_cloned_id;
end;
$$;

revoke all on function public.clone_volunteer_activity_with_audit(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.clone_volunteer_activity_with_audit(
  uuid, uuid, timestamptz
) to service_role;
