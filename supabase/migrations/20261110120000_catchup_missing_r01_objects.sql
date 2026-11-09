-- Catch-up migration: restore objects the deployed code requires but production lacks.

-- Reconstructed from the repository migration definitions; only absent objects are added.

-- Generated 2026-11-09 (stale-schema incident). Deviations intentionally omitted:

--   * audit_log staff-read policy stays revoked (AUTH-01 fix)

--   * admin_user 'admins can view admin users' policy omitted (superseded by mainline policies)

set local check_function_bodies = off;

-- private.document_publication_fences (created inside a DO block in 20261006023123; absent in production)
create table if not exists private.document_publication_fences (
      asset_id uuid not null,
      version boolean not null default false,
      constraint document_publication_fences_pkey primary key(asset_id),
      constraint document_publication_fences_asset_fkey foreign key(asset_id)
        references public.document_assets(id) on delete cascade
    );

create table if not exists public.adoption_upload_intent (
  application_id uuid primary key,
  photo_paths text[] not null
    check (cardinality(photo_paths) between 1 and 6),
  status_token_hash text not null unique
    check (status_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  constraint adoption_upload_intent_expiry_after_creation
    check (expires_at > created_at)
);

create table if not exists public.animal_draft_image_upload_intent (
  storage_path text primary key,
  animal_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  attached_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint animal_draft_image_upload_path
    check (storage_path like animal_id::text || '/%'),
  constraint animal_draft_image_upload_expiry
    check (expires_at > created_at)
);

create table if not exists public.internship_attachment_upload_intent (
  storage_path text primary key,
  application_id uuid not null references public.internship_application(id),
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  attached_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleaned_at timestamptz,
  constraint internship_attachment_upload_intent_path
    check (storage_path like actor::text || '/' || application_id::text || '/%'),
  constraint internship_attachment_upload_intent_expiry
    check (expires_at > created_at)
);

create table if not exists public.sponsorship_proof_upload_intent (
  pledge_id uuid primary key,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint sponsorship_proof_upload_intent_path
    check (storage_path like pledge_id::text || '/proof/%'),
  constraint sponsorship_proof_upload_intent_expiry
    check (expires_at > created_at)
);

create table if not exists public.sponsorship_staff_proof_upload_intent (
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

do $catchup$ begin alter table public.public_status_token
  add column if not exists submission_fingerprint text; exception when duplicate_column then null; when duplicate_object then null; end $catchup$;

create unique index if not exists recipient_notification_draft_delivery_target_idx
  on public.recipient_notification_draft (story_update_id, channel, recipient_contact);

create unique index if not exists message_volunteer_registration_admin_unique
  on public.message ((payload ->> 'registrationId'))
  where channel = 'email'
    and payload ->> 'kind' = 'volunteer_registration_admin_notification';

create index if not exists adoption_upload_intent_cleanup_idx
  on public.adoption_upload_intent (expires_at)
  where submitted_at is null;

create index if not exists sponsorship_proof_upload_intent_cleanup_idx
  on public.sponsorship_proof_upload_intent (expires_at)
  where submitted_at is null;

create index if not exists internship_attachment_upload_intent_cleanup_idx
  on public.internship_attachment_upload_intent (expires_at)
  where attached_at is null and cleaned_at is null;

create index if not exists sponsorship_staff_proof_upload_cleanup_idx
  on public.sponsorship_staff_proof_upload_intent (expires_at)
  where attached_at is null;

create index if not exists animal_draft_image_upload_cleanup_idx
  on public.animal_draft_image_upload_intent (expires_at)
  where attached_at is null;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'activate_admin_invite_with_audit') then
    create function public.activate_admin_invite_with_audit(
  p_auth_user_id uuid
)
returns public.admin_user
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  admin_row public.admin_user%rowtype;
  accepted_at timestamptz;
begin
  if p_auth_user_id is null then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));

  select * into admin_row
  from public.admin_user
  where auth_user_id = p_auth_user_id
  for update;

  if not found or admin_row.status = 'disabled' then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;
  if admin_row.status = 'active' then
    return admin_row;
  end if;
  if admin_row.status <> 'pending' then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  accepted_at := now();
  update public.admin_user
  set status = 'active',
      invite_accepted_at = accepted_at
  where id = admin_row.id
  returning * into admin_row;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, timestamp, detail
  ) values (
    p_auth_user_id,
    'admin_user.activate_from_invite',
    'admin_user',
    admin_row.id::text,
    accepted_at,
    jsonb_build_object(
      'targetEmail', admin_row.email,
      'oldStatus', 'pending',
      'newStatus', 'active',
      'role', admin_row.role
    )
  );

  return admin_row;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.activate_admin_invite_with_audit(uuid)
  from public, anon, authenticated;

grant execute on function public.activate_admin_invite_with_audit(uuid)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'append_crm_consents_with_audit') then
    create function public.append_crm_consents_with_audit(
  p_rows jsonb,
  p_actor_user_id uuid,
  p_supporter_id uuid,
  p_at timestamptz,
  p_detail jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_consent_rows';
  end if;
  perform 1 from public.supporter where id = p_supporter_id for update;
  if not found then
    raise exception 'supporter_not_found';
  end if;
  insert into public.consent(supporter_id, channel, status, source, "timestamp")
  select p_supporter_id, row->>'channel', row->>'status', row->>'source', (row->>'timestamp')::timestamptz
  from jsonb_array_elements(p_rows) as row
  on conflict (supporter_id, channel, status, source, "timestamp") do nothing;
  insert into public.audit_log(actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (p_actor_user_id, 'consent.append', 'supporter', p_supporter_id::text, p_at, coalesce(p_detail, '{}'::jsonb));
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb) from public, anon, authenticated;

grant execute on function public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_expired_animal_draft_image_uploads') then
    create function public.claim_expired_animal_draft_image_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (animal_id uuid, storage_path text, claimed_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select intent.storage_path
    from public.animal_draft_image_upload_intent as intent
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
  update public.animal_draft_image_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.storage_path = candidates.storage_path
  returning intent.animal_id, intent.storage_path, intent.cleanup_claimed_at;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.claim_expired_animal_draft_image_uploads(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.claim_expired_animal_draft_image_uploads(timestamptz, integer)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_expired_internship_attachment_uploads') then
    create function public.claim_expired_internship_attachment_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (storage_path text, claimed_at timestamptz)
language sql
set search_path = ''
as $$
  with candidates as (
    select intent.storage_path
    from public.internship_attachment_upload_intent as intent
    where intent.attached_at is null
      and intent.cleaned_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.internship_attachment_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.storage_path = candidates.storage_path
  returning intent.storage_path, intent.cleanup_claimed_at;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.claim_expired_internship_attachment_uploads(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.claim_expired_internship_attachment_uploads(timestamptz, integer)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_expired_sponsorship_proof_uploads') then
    create function public.claim_expired_sponsorship_proof_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (pledge_id uuid, storage_path text, claimed_at timestamptz)
language sql
set search_path = ''
as $$
  with candidates as (
    select intent.pledge_id
    from public.sponsorship_proof_upload_intent as intent
    where intent.submitted_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  )
  update public.sponsorship_proof_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.pledge_id = candidates.pledge_id
  returning intent.pledge_id, intent.storage_path, intent.cleanup_claimed_at;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.claim_expired_sponsorship_proof_uploads(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.claim_expired_sponsorship_proof_uploads(timestamptz, integer)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_expired_staff_sponsorship_proof_uploads') then
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
  end if;
end $catchup_guard$;

revoke all on function public.claim_expired_staff_sponsorship_proof_uploads(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.claim_expired_staff_sponsorship_proof_uploads(timestamptz, integer)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cleanup_expired_adoption_application') then
    create function public.cleanup_expired_adoption_application(
  p_application_id uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.adoption_upload_intent%rowtype;
begin
  select * into v_intent
  from public.adoption_upload_intent
  where application_id = p_application_id
  for update;

  if not found or v_intent.submitted_at is not null
    or v_intent.expires_at >= clock_timestamp() - interval '1 hour' then
    return 'defer';
  end if;
  perform 1
  from public.adoption_applications
  where id = p_application_id
  for update;

  if found then
    if exists (
      select 1 from public.adoption_case
      where public_application_id = p_application_id
    ) then
      return 'completed';
    end if;

    delete from public.adoption_applications where id = p_application_id;
  end if;

  return 'purged';
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.cleanup_expired_adoption_application(uuid)
  from public, anon, authenticated;

grant execute on function public.cleanup_expired_adoption_application(uuid)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'clone_volunteer_activity_with_audit') then
    create function public.clone_volunteer_activity_with_audit(
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
  end if;
end $catchup_guard$;

revoke all on function public.clone_volunteer_activity_with_audit(
  uuid, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.clone_volunteer_activity_with_audit(
  uuid, uuid, timestamptz
) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cms_promotion_command') then
    create function public.cms_promotion_command(p_actor uuid, p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := p_command->>'kind';
  v_content_id uuid;
  v_update_id uuid;
  v_id uuid;
  v_status text;
  v_count integer;
begin
  if not exists (
    select 1
    from public.admin_user a
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = p_actor
      and a.status = 'active'
      and a.role in ('staff', 'admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_kind = 'social_generate' then
    v_content_id := (p_command->>'content_id')::uuid;
    v_update_id := (p_command->>'story_update_id')::uuid;
    if not exists (select 1 from public.content_item where id = v_content_id) then
      raise exception 'content not found' using errcode = '22023';
    end if;
    if v_update_id is not null and not exists (
      select 1 from public.story_update
      where id = v_update_id and content_item_id = v_content_id
        and visibility = 'public' and is_authoring_active = true
    ) then
      raise exception 'public story update not found' using errcode = '22023';
    end if;
    if jsonb_typeof(p_command->'rows') is distinct from 'array'
       or jsonb_array_length(p_command->'rows') > 100
       or exists (
         select 1 from jsonb_array_elements(p_command->'rows') entry
         where (entry->>'content_item_id') is distinct from v_content_id::text
           or (entry->>'story_update_id') is distinct from v_update_id::text
           or entry->>'platform' not in ('facebook', 'instagram', 'whatsapp')
           or entry->>'language' is distinct from 'zh-HK'
           or nullif(btrim(entry->>'copy_text'), '') is null
           or jsonb_typeof(entry->'hashtags') is distinct from 'array'
           or entry->>'status' is distinct from 'draft'
       )
    then
      raise exception 'invalid social copy rows' using errcode = '22023';
    end if;

    insert into public.social_copy_variant (
      content_item_id, story_update_id, platform, language, copy_text, hashtags, status,
      created_by
    )
    select v_content_id, v_update_id, entry.platform, 'zh-HK',
           entry.copy_text, coalesce(entry.hashtags, array[]::text[]), 'draft', p_actor
    from jsonb_to_recordset(p_command->'rows') as entry(
      platform text, copy_text text, hashtags text[]
    );
    get diagnostics v_count = row_count;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor, 'content.social_copy.generate', 'social_copy_variant',
            v_content_id::text,
            jsonb_build_object('count', v_count, 'storyUpdateId', v_update_id,
                               'platform', p_command->>'platform'));
    return jsonb_build_object('count', v_count);
  end if;

  if v_kind = 'draft_generate' then
    v_update_id := (p_command->>'story_update_id')::uuid;
    select content_item_id into v_content_id
    from public.story_update
    where id = v_update_id and visibility = 'public' and is_authoring_active = true;
    if v_content_id is null then
      raise exception 'public story update not found' using errcode = '22023';
    end if;
    if jsonb_typeof(p_command->'rows') is distinct from 'array'
       or jsonb_array_length(p_command->'rows') > 500
       or exists (
         select 1 from jsonb_array_elements(p_command->'rows') entry
         where (entry->>'story_update_id') is distinct from v_update_id::text
           or (entry->>'content_item_id') is distinct from v_content_id::text
           or entry->>'channel' not in ('email', 'whatsapp')
           or nullif(btrim(entry->>'recipient_contact'), '') is null
           or nullif(btrim(entry->>'recipient_name'), '') is null
           or nullif(btrim(entry->>'body'), '') is null
           or entry->>'status' is distinct from 'draft'
       )
    then
      raise exception 'invalid notification draft rows' using errcode = '22023';
    end if;

    insert into public.recipient_notification_draft (
      story_update_id, content_item_id, adoption_case_id, supporter_id, channel,
      recipient_name, recipient_contact, subject, body, status, created_by
    )
    select v_update_id, v_content_id, entry.adoption_case_id, entry.supporter_id,
           entry.channel, entry.recipient_name, entry.recipient_contact, entry.subject,
           entry.body, 'draft', p_actor
    from jsonb_to_recordset(p_command->'rows') as entry(
      adoption_case_id uuid, supporter_id uuid, channel text,
      recipient_name text, recipient_contact text, subject text, body text
    )
    on conflict (story_update_id, channel, recipient_contact) do nothing;
    get diagnostics v_count = row_count;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor, 'content.notification_draft.generate',
            'recipient_notification_draft', v_update_id::text,
            jsonb_build_object('count', v_count));
    return jsonb_build_object('count', v_count);
  end if;

  if v_kind = 'social_status' then
    v_id := (p_command->>'id')::uuid;
    v_status := p_command->>'status';
    if v_status not in ('draft', 'copied', 'archived') then
      raise exception 'invalid social copy status' using errcode = '22023';
    end if;
    update public.social_copy_variant set status = v_status, updated_by = p_actor
    where id = v_id returning id into v_id;
    if not found then
      raise exception 'social copy not found' using errcode = '22023';
    end if;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor, 'content.social_copy.status', 'social_copy_variant',
            v_id::text, jsonb_build_object('status', v_status));
    return jsonb_build_object('ok', true);
  end if;

  if v_kind = 'draft_status' then
    v_id := (p_command->>'id')::uuid;
    v_status := p_command->>'status';
    if v_status not in ('draft', 'copied', 'sent_manually', 'dismissed') then
      raise exception 'invalid notification draft status' using errcode = '22023';
    end if;
    update public.recipient_notification_draft set status = v_status, updated_by = p_actor
    where id = v_id returning id into v_id;
    if not found then
      raise exception 'notification draft not found' using errcode = '22023';
    end if;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor, 'content.notification_draft.status',
            'recipient_notification_draft', v_id::text,
            jsonb_build_object('status', v_status));
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'invalid CMS promotion command' using errcode = '22023';
end
$$;
  end if;
end $catchup_guard$;

revoke all on function public.cms_promotion_command(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.cms_promotion_command(uuid, jsonb) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_public_sponsorship_pledge') then
    create function public.create_public_sponsorship_pledge(
  p_pledge_id uuid,
  p_pledge jsonb,
  p_preferences jsonb,
  p_proof jsonb,
  p_token jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.sponsorship_pledge (
    id, supporter_id, monthly_tier, amount_cents, currency, language, notes,
    contact_submission, status, consent_email_requested, consent_whatsapp_requested
  ) values (
    p_pledge_id,
    (p_pledge->>'supporter_id')::uuid,
    p_pledge->>'monthly_tier',
    (p_pledge->>'amount_cents')::integer,
    p_pledge->>'currency',
    p_pledge->>'language',
    p_pledge->>'notes',
    p_pledge->'contact_submission',
    p_pledge->>'status',
    (p_pledge->>'consent_email_requested')::boolean,
    (p_pledge->>'consent_whatsapp_requested')::boolean
  );

  insert into public.sponsorship_preference (
    pledge_id, sponsor_animal_id, rank, animal_name_snapshot, animal_type_snapshot
  )
  select
    p_pledge_id, preference.sponsor_animal_id, preference.rank,
    preference.animal_name_snapshot, preference.animal_type_snapshot
  from pg_catalog.jsonb_to_recordset(p_preferences) as preference (
    sponsor_animal_id uuid,
    rank integer,
    animal_name_snapshot text,
    animal_type_snapshot text
  );

  if p_proof is not null then
    insert into public.sponsorship_payment_proof (
      pledge_id, storage_path, file_name, file_type, file_size, payment_method,
      reference, amount_cents, payment_date, review_status
    ) values (
      p_pledge_id,
      p_proof->>'storage_path',
      p_proof->>'file_name',
      p_proof->>'file_type',
      (p_proof->>'file_size')::integer,
      p_proof->>'payment_method',
      p_proof->>'reference',
      (p_proof->>'amount_cents')::integer,
      (p_proof->>'payment_date')::date,
      'pending'
    );
  end if;

  insert into public.public_status_token (
    token_hash, entity_type, entity_id, expires_at, submission_fingerprint
  ) values (
    p_token->>'token_hash',
    'sponsorship_pledge',
    p_pledge_id,
    (p_token->>'expires_at')::timestamptz,
    p_token->>'submission_fingerprint'
  );
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_volunteer_registration_idempotent') then
    create function public.create_volunteer_registration_idempotent(
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
  end if;
end $catchup_guard$;

revoke all on function public.create_volunteer_registration_idempotent(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_volunteer_registration_idempotent(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer,
  text, text, text, text, timestamptz, boolean, boolean
) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'enforce_published_knowledge_document_assets') then
    create function private.enforce_published_knowledge_document_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_asset_id uuid;
begin
  if new.is_published then
    for referenced_asset_id in
      select distinct refs.asset_id
      from unnest(array[
        new.document_asset_id,
        new.zh_hk_document_asset_id,
        new.en_document_asset_id
      ]) as refs(asset_id)
      where refs.asset_id is not null
      order by refs.asset_id
    loop
      perform 1
      from public.document_assets
      where id = referenced_asset_id
        and is_published = true
      for update;

      if not found then
        raise exception 'Publish the PDF asset before publishing its knowledge post'
          using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'enforce_published_site_document_slot_asset') then
    create function private.enforce_published_site_document_slot_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_published then
    perform 1
    from public.document_assets
    where id = new.document_asset_id
      and is_published = true
    for update;

    if not found then
      raise exception 'Publish the PDF asset before publishing its site document slot'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fail_pending_provider_payment') then
    create function public.fail_pending_provider_payment(
  p_payment_id uuid,
  p_donation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payment%rowtype;
  v_donation public.donation%rowtype;
  v_now timestamptz;
begin
  if p_payment_id is null or p_donation_id is null then
    raise exception 'missing payment or donation id' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payment
  where id = p_payment_id
  for update;
  if not found or v_payment.donation_id <> p_donation_id then
    return jsonb_build_object('kind', 'not_found');
  end if;

  select * into v_donation
  from public.donation
  where id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  if v_payment.status not in ('pending', 'failed')
     or v_donation.status not in ('pending', 'failed') then
    return jsonb_build_object(
      'kind', 'state_conflict',
      'payment_status', v_payment.status,
      'donation_status', v_donation.status
    );
  end if;

  if v_payment.status = 'failed' and v_donation.status = 'failed' then
    return jsonb_build_object('kind', 'already_failed');
  end if;

  v_now := clock_timestamp();
  update public.payment
  set status = 'failed', updated_at = v_now
  where id = p_payment_id and status = 'pending';

  update public.donation
  set status = 'failed', updated_at = v_now
  where id = p_donation_id and status = 'pending';

  return jsonb_build_object('kind', 'failed');
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.fail_pending_provider_payment(uuid, uuid) from public, anon, authenticated;

grant execute on function public.fail_pending_provider_payment(uuid, uuid) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'invite_admin_user_with_audit') then
    create function public.invite_admin_user_with_audit(
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_role text,
  p_sent_at timestamptz
)
returns public.admin_user
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_row public.admin_user%rowtype;
  invited_user_row public.admin_user%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));

  if not exists (
    select 1 from public.admin_user
    where auth_user_id = p_actor_user_id and role = 'admin' and status = 'active'
  ) then
    raise exception 'admin_actor_denied' using errcode = 'P0001';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if p_role is null or p_role not in ('staff', 'treasurer', 'admin') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if p_auth_user_id is null or p_sent_at is null then
    raise exception 'invalid_invite_input' using errcode = 'P0001';
  end if;

  select * into current_user_row
  from public.admin_user
  where email = p_email::citext
  for update;

  if found and current_user_row.status <> 'disabled' then
    raise exception 'duplicate_admin_user' using errcode = 'P0001';
  end if;

  if found then
    update public.admin_user
    set auth_user_id = p_auth_user_id,
        role = p_role,
        status = 'pending',
        invited_at = p_sent_at,
        invite_sent_at = p_sent_at,
        invite_accepted_at = null,
        last_invited_by = p_actor_user_id
    where id = current_user_row.id
    returning * into invited_user_row;
  else
    insert into public.admin_user (
      auth_user_id, email, role, status, invited_at, invite_sent_at,
      invite_accepted_at, last_invited_by
    ) values (
      p_auth_user_id, p_email, p_role, 'pending', p_sent_at, p_sent_at,
      null, p_actor_user_id
    )
    returning * into invited_user_row;
  end if;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, timestamp, detail
  ) values (
    p_actor_user_id,
    'admin_user.invite',
    'admin_user',
    invited_user_row.id::text,
    p_sent_at,
    jsonb_build_object(
      'targetEmail', invited_user_row.email,
      'role', invited_user_row.role,
      'status', invited_user_row.status
    )
  );

  return invited_user_row;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.invite_admin_user_with_audit(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.invite_admin_user_with_audit(uuid, uuid, text, text, timestamptz)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'lock_admin_user_mutation') then
    create function private.lock_admin_user_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));
  return null;
end;
$$;
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_animal_draft_image_attached') then
    create function public.mark_animal_draft_image_attached()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_path text;
  v_claimed_at timestamptz;
begin
  for v_path in
    select distinct paths.path
    from (
      select nullif(new.body->>'draft_image_path', '') as path
      union all
      select nullif(photo->>'draft_path', '') as path
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(new.body->'gallery') = 'array'
          then new.body->'gallery'
          else '[]'::jsonb
        end
      ) as photo
    ) as paths
    where paths.path is not null
      and paths.path like new.id::text || '/%'
  loop
    select intent.cleanup_claimed_at into v_claimed_at
    from public.animal_draft_image_upload_intent as intent
    where intent.storage_path = v_path
      and intent.animal_id = new.id
    for update;

    if found then
      if v_claimed_at is not null then
        raise exception 'animal draft image is being cleaned up' using errcode = '55000';
      end if;
      update public.animal_draft_image_upload_intent
      set attached_at = pg_catalog.clock_timestamp()
      where storage_path = v_path;
    end if;
  end loop;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.mark_animal_draft_image_attached()
  from public, anon, authenticated;

grant execute on function public.mark_animal_draft_image_attached()
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_internship_attachment_uploaded') then
    create function public.mark_internship_attachment_uploaded()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claimed_at timestamptz;
begin
  select intent.cleanup_claimed_at into v_claimed_at
  from public.internship_attachment_upload_intent as intent
  where intent.storage_path = new.object_path
  for update;

  if found then
    if v_claimed_at is not null then
      raise exception 'internship attachment upload is being cleaned up'
        using errcode = '55000';
    end if;
    update public.internship_attachment_upload_intent
    set attached_at = pg_catalog.clock_timestamp()
    where storage_path = new.object_path;
  end if;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.mark_internship_attachment_uploaded()
  from public, anon, authenticated;

grant execute on function public.mark_internship_attachment_uploaded()
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_sponsorship_proof_upload_submitted') then
    create function public.mark_sponsorship_proof_upload_submitted()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claimed_at timestamptz;
begin
  select intent.cleanup_claimed_at into v_claimed_at
  from public.sponsorship_proof_upload_intent as intent
  where intent.pledge_id = new.pledge_id
    and intent.storage_path = new.storage_path
  for update;

  if found then
    if v_claimed_at is not null then
      raise exception 'sponsorship proof upload is being cleaned up'
        using errcode = '55000';
    end if;
    update public.sponsorship_proof_upload_intent
    set submitted_at = pg_catalog.clock_timestamp()
    where pledge_id = new.pledge_id;
  end if;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.mark_sponsorship_proof_upload_submitted()
  from public, anon, authenticated;

grant execute on function public.mark_sponsorship_proof_upload_submitted()
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_staff_sponsorship_proof_attached') then
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
  end if;
end $catchup_guard$;

revoke all on function public.mark_staff_sponsorship_proof_attached()
  from public, anon, authenticated;

grant execute on function public.mark_staff_sponsorship_proof_attached()
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'protect_published_document_references') then
    create function private.protect_published_document_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_published and not new.is_published
    and (
      exists (
        select 1
        from public.site_document_slots
        where document_asset_id = new.id
          and is_published = true
      )
      or exists (
        select 1
        from public.knowledge_posts
        where is_published = true
          and new.id in (
            document_asset_id,
            zh_hk_document_asset_id,
            en_document_asset_id
          )
      )
    )
  then
    raise exception 'Unpublish public document references before unpublishing their PDF asset'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'refund_provider_payment_atomically') then
    create function public.refund_provider_payment_atomically(
  p_payment_id uuid,
  p_donation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payment%rowtype;
  v_donation public.donation%rowtype;
  v_now timestamptz;
begin
  if p_payment_id is null or p_donation_id is null then
    raise exception 'missing payment or donation id' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payment
  where id = p_payment_id
  for update;
  if not found or v_payment.donation_id <> p_donation_id then
    return jsonb_build_object('kind', 'not_found');
  end if;

  select * into v_donation
  from public.donation
  where id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  if v_payment.status not in ('pending', 'succeeded', 'refunded')
     or v_donation.status not in ('pending', 'succeeded', 'refunded') then
    return jsonb_build_object(
      'kind', 'state_conflict',
      'payment_status', v_payment.status,
      'donation_status', v_donation.status
    );
  end if;

  if v_payment.status = 'refunded' and v_donation.status = 'refunded' then
    return jsonb_build_object('kind', 'already_refunded');
  end if;

  v_now := clock_timestamp();
  update public.payment
  set status = 'refunded', updated_at = v_now
  where id = p_payment_id and status in ('pending', 'succeeded');

  update public.donation
  set status = 'refunded', updated_at = v_now
  where id = p_donation_id and status in ('pending', 'succeeded');

  return jsonb_build_object('kind', 'refunded');
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.refund_provider_payment_atomically(uuid, uuid) from public, anon, authenticated;

grant execute on function public.refund_provider_payment_atomically(uuid, uuid) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'replace_supporter_roles_atomic') then
    create function public.replace_supporter_roles_atomic(
  p_supporter_id uuid,
  p_roles jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' then
    raise exception 'invalid_supporter_roles';
  end if;
  perform 1 from public.supporter where id = p_supporter_id for update;
  if not found then
    raise exception 'supporter_not_found';
  end if;
  delete from public.supporter_role where supporter_id = p_supporter_id;
  insert into public.supporter_role(supporter_id, role)
  select p_supporter_id, role from jsonb_array_elements_text(p_roles) as role;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.replace_supporter_roles_atomic(uuid,jsonb) from public, anon, authenticated;

grant execute on function public.replace_supporter_roles_atomic(uuid,jsonb) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'require_active_admin_user') then
    create function private.require_active_admin_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_active_admin boolean;
begin
  if tg_op = 'DELETE' then
    removed_active_admin := old.role = 'admin' and old.status = 'active';
  else
    removed_active_admin := old.role = 'admin' and old.status = 'active'
      and (new.role <> 'admin' or new.status <> 'active');
  end if;

  if removed_active_admin and not exists (
    select 1 from public.admin_user
    where role = 'admin' and status = 'active'
  ) then
    raise exception 'last_active_admin' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'resend_admin_invite_with_audit') then
    create function public.resend_admin_invite_with_audit(
  p_actor_user_id uuid,
  p_target_id uuid,
  p_sent_at timestamptz
)
returns public.admin_user
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_row public.admin_user%rowtype;
  resent_user_row public.admin_user%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));

  if not exists (
    select 1 from public.admin_user
    where auth_user_id = p_actor_user_id and role = 'admin' and status = 'active'
  ) then
    raise exception 'admin_actor_denied' using errcode = 'P0001';
  end if;
  if p_sent_at is null then
    raise exception 'invalid_invite_input' using errcode = 'P0001';
  end if;

  select * into current_user_row
  from public.admin_user
  where id = p_target_id
  for update;
  if not found then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;
  if current_user_row.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = 'P0001';
  end if;

  update public.admin_user
  set invite_sent_at = p_sent_at,
      last_invited_by = p_actor_user_id
  where id = p_target_id
  returning * into resent_user_row;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, timestamp, detail
  ) values (
    p_actor_user_id,
    'admin_user.invite_resend',
    'admin_user',
    resent_user_row.id::text,
    p_sent_at,
    jsonb_build_object(
      'targetEmail', resent_user_row.email,
      'role', resent_user_row.role,
      'status', resent_user_row.status
    )
  );

  return resent_user_row;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.resend_admin_invite_with_audit(uuid, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.resend_admin_invite_with_audit(uuid, uuid, timestamptz)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_animal_draft_image_upload') then
    create function public.reserve_animal_draft_image_upload(
  p_animal_id uuid,
  p_storage_path text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text;
begin
  if p_animal_id is null or p_storage_path is null then
    raise exception 'invalid_animal_draft_upload_intent' using errcode = '22023';
  end if;

  insert into public.animal_draft_image_upload_intent (
    storage_path, animal_id, expires_at
  ) values (
    p_storage_path, p_animal_id, pg_catalog.clock_timestamp() + interval '1 day'
  )
  on conflict (storage_path) do update
  set expires_at = greatest(
    public.animal_draft_image_upload_intent.expires_at,
    excluded.expires_at
  )
  where public.animal_draft_image_upload_intent.animal_id = excluded.animal_id
    and public.animal_draft_image_upload_intent.cleanup_claimed_at is null
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'animal_draft_upload_cleanup_in_progress' using errcode = '55000';
  end if;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.reserve_animal_draft_image_upload(uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserve_animal_draft_image_upload(uuid, text)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_staff_sponsorship_proof_upload') then
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
  end if;
end $catchup_guard$;

revoke all on function public.reserve_staff_sponsorship_proof_upload(uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserve_staff_sponsorship_proof_upload(uuid, text)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_animal_archived_with_audit') then
    create function public.set_animal_archived_with_audit(
  p_actor_user_id uuid,
  p_animal_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous timestamptz;
  v_next timestamptz;
  v_now timestamptz;
begin
  if p_actor_user_id is null or p_animal_id is null or p_archived is null then
    raise exception 'invalid archive arguments' using errcode = '22023';
  end if;

  select a.retired_at into v_previous
  from public.animals a
  where a.id = p_animal_id
  for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if (v_previous is not null) = p_archived then
    return jsonb_build_object(
      'kind', 'unchanged', 'id', p_animal_id, 'retired_at', v_previous
    );
  end if;

  v_now := clock_timestamp();
  v_next := case when p_archived then v_now else null end;
  update public.animals
  set retired_at = v_next, updated_at = v_now
  where id = p_animal_id;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, "timestamp", detail
  )
  values (
    p_actor_user_id, 'animals.update', 'animals', p_animal_id::text, v_now,
    jsonb_build_object(
      'changed',
      jsonb_build_object(
        'retired_at', jsonb_build_object('from', v_previous, 'to', v_next)
      )
    )
  );

  return jsonb_build_object(
    'kind', case when p_archived then 'archived' else 'restored' end,
    'id', p_animal_id,
    'retired_at', v_next
  );
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.set_animal_archived_with_audit(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.set_animal_archived_with_audit(uuid, uuid, boolean) to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_group_enquiry_with_audit') then
    create function public.update_group_enquiry_with_audit(
  p_enquiry_id uuid,
  p_actor_user_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enquiry public.group_enquiries%rowtype;
  v_fields jsonb;
begin
  if not exists (
    select 1 from public.admin_user
    where auth_user_id = p_actor_user_id
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'group_enquiry_forbidden' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
    or p_patch = '{}'::jsonb
    or exists (
      select 1 from jsonb_object_keys(p_patch) as k(key)
      where k.key not in ('status', 'assignedTo', 'adminNotes')
    )
  then
    raise exception 'invalid_group_enquiry_patch' using errcode = '22023';
  end if;

  select * into v_enquiry
  from public.group_enquiries
  where id = p_enquiry_id
  for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if p_expected_updated_at is null or v_enquiry.updated_at <> p_expected_updated_at then
    return jsonb_build_object('kind', 'conflict');
  end if;

  update public.group_enquiries
  set status = case when p_patch ? 'status' then p_patch->>'status' else status end,
      assigned_to = case when p_patch ? 'assignedTo'
        then (p_patch->>'assignedTo')::uuid else assigned_to end,
      admin_notes = case when p_patch ? 'adminNotes'
        then p_patch->>'adminNotes' else admin_notes end
  where id = p_enquiry_id
  returning * into v_enquiry;

  select coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb)
  into v_fields
  from jsonb_object_keys(p_patch) as k(key);
  insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'group_enquiries.update',
    'group_enquiries',
    p_enquiry_id::text,
    jsonb_build_object('fields', v_fields, 'status', p_patch->>'status')
  );

  return jsonb_build_object('kind', 'updated', 'enquiry', to_jsonb(v_enquiry));
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.update_group_enquiry_with_audit(uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.update_group_enquiry_with_audit(uuid, uuid, timestamptz, jsonb)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'void_donation_receipts_with_audit') then
    create function public.void_donation_receipts_with_audit(
  p_donation_id uuid,
  p_reason text default 'refund'
)
returns table (receipt_id uuid, pdf_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipt%rowtype;
  v_voided_at timestamptz;
begin
  if p_donation_id is null or p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception 'invalid_receipt_void_request' using errcode = '22023';
  end if;

  for v_receipt in
    select * from public.receipt
    where donation_ids @> array[p_donation_id]
      and status = 'issued'
    order by id
    for update
  loop
    v_voided_at := pg_catalog.clock_timestamp();
    update public.receipt
    set status = 'void', voided_at = v_voided_at, voided_by = null
    where id = v_receipt.id;

    insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
    values (
      null, 'receipt.void', 'receipt', v_receipt.id::text,
      pg_catalog.jsonb_build_object(
        'voidedAt', v_voided_at,
        'donationId', p_donation_id,
        'reason', p_reason
      )
    );

    return query select v_receipt.id, v_receipt.pdf_url;
  end loop;
end;
$$;
  end if;
end $catchup_guard$;

revoke all on function public.void_donation_receipts_with_audit(uuid, text)
  from public, anon, authenticated;

grant execute on function public.void_donation_receipts_with_audit(uuid, text)
  to service_role;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'lock_admin_user_mutation' and not t.tgisinternal) then
    create trigger lock_admin_user_mutation
  before update or delete on public.admin_user
  for each statement execute function private.lock_admin_user_mutation();
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'require_active_admin_user' and not t.tgisinternal) then
    create trigger require_active_admin_user
  after update or delete on public.admin_user
  for each row execute function private.require_active_admin_user();
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'sponsorship_proof_upload_submitted' and not t.tgisinternal) then
    create trigger sponsorship_proof_upload_submitted
after insert on public.sponsorship_payment_proof
for each row execute function public.mark_sponsorship_proof_upload_submitted();
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'internship_attachment_uploaded' and not t.tgisinternal) then
    create trigger internship_attachment_uploaded
after insert on public.internship_attachment
for each row execute function public.mark_internship_attachment_uploaded();
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'sponsorship_staff_proof_attached' and not t.tgisinternal) then
    create trigger sponsorship_staff_proof_attached
  after insert on public.sponsorship_payment_proof
  for each row execute function public.mark_staff_sponsorship_proof_attached();
  end if;
end $catchup_guard$;

do $catchup_guard$ begin
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and t.tgname = 'animal_draft_image_attached' and not t.tgisinternal) then
    create trigger animal_draft_image_attached
  after insert or update of body on public.animal_draft
  for each row execute function public.mark_animal_draft_image_attached();
  end if;
end $catchup_guard$;

-- ---- RLS / privileges for the restored tables (from the defining migrations) ----
-- 20260925123000_adoption_upload_intents.sql: adoption_upload_intent
alter table public.adoption_upload_intent enable row level security;

-- 20260925123000_adoption_upload_intents.sql: adoption_upload_intent
revoke all on public.adoption_upload_intent from public, anon, authenticated;

-- 20260925123000_adoption_upload_intents.sql: adoption_upload_intent
grant select, insert, update, delete on public.adoption_upload_intent to service_role;

-- 20260926160000_animal_draft_upload_cleanup.sql: animal_draft_image_upload_intent
alter table public.animal_draft_image_upload_intent enable row level security;

-- 20260926160000_animal_draft_upload_cleanup.sql: animal_draft_image_upload_intent
revoke all on public.animal_draft_image_upload_intent from public, anon, authenticated;

-- 20260926160000_animal_draft_upload_cleanup.sql: animal_draft_image_upload_intent
grant select, insert, update, delete on public.animal_draft_image_upload_intent to service_role;

-- 20260926074203_internship_attachment_upload_cleanup.sql: internship_attachment_upload_intent
alter table public.internship_attachment_upload_intent enable row level security;

-- 20260926074203_internship_attachment_upload_cleanup.sql: internship_attachment_upload_intent
revoke all on public.internship_attachment_upload_intent from public, anon, authenticated;

-- 20260926074203_internship_attachment_upload_cleanup.sql: internship_attachment_upload_intent
grant select, insert, update, delete on public.internship_attachment_upload_intent to service_role;

-- 20260926070652_sponsorship_proof_upload_cleanup.sql: sponsorship_proof_upload_intent
alter table public.sponsorship_proof_upload_intent enable row level security;

-- 20260926070652_sponsorship_proof_upload_cleanup.sql: sponsorship_proof_upload_intent
revoke all on public.sponsorship_proof_upload_intent from public, anon, authenticated;

-- 20260926070652_sponsorship_proof_upload_cleanup.sql: sponsorship_proof_upload_intent
grant select, insert, update, delete on public.sponsorship_proof_upload_intent to service_role;

-- 20260926091057_staff_sponsorship_proof_upload_cleanup.sql: sponsorship_staff_proof_upload_intent
alter table public.sponsorship_staff_proof_upload_intent enable row level security;

-- 20260926091057_staff_sponsorship_proof_upload_cleanup.sql: sponsorship_staff_proof_upload_intent
revoke all on public.sponsorship_staff_proof_upload_intent from public, anon, authenticated;

-- 20260926091057_staff_sponsorship_proof_upload_cleanup.sql: sponsorship_staff_proof_upload_intent
grant select, insert, update, delete on public.sponsorship_staff_proof_upload_intent to service_role;
