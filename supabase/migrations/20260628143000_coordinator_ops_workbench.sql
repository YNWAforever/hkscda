alter table public.adoption_case
  add column if not exists source text not null default 'public_form',
  add column if not exists created_by uuid references auth.users(id);

alter table public.adoption_case
  drop constraint if exists adoption_case_source_check;

alter table public.adoption_case
  add constraint adoption_case_source_check
  check (source in ('public_form', 'manual_intake'));

update public.adoption_case
set source = 'public_form'
where source is null;

create index if not exists adoption_case_source_created_idx
  on public.adoption_case (source, created_at desc);

create index if not exists adoption_case_created_by_created_idx
  on public.adoption_case (created_by, created_at desc);

create index if not exists audit_log_action_timestamp_idx
  on public.audit_log (action, timestamp desc);

create index if not exists audit_log_detail_kind_timestamp_idx
  on public.audit_log ((detail->>'kind'), timestamp desc);

create or replace function private.create_manual_adoption_case(
  p_actor_user_id uuid,
  p_identity jsonb,
  p_case jsonb,
  p_initial_task jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_identity_kind text := p_identity->>'kind';
  v_supporter_id uuid;
  v_adopter_profile_id uuid;
  v_case_id uuid;
  v_task_id uuid;
begin
  if not private.has_admin_role(array['staff', 'admin']) then
    raise exception 'Forbidden';
  end if;

  if v_identity_kind = 'existing_adopter' then
    v_adopter_profile_id := (p_identity->>'adopterProfileId')::uuid;
    select supporter_id into v_supporter_id
    from public.adopter_profile
    where id = v_adopter_profile_id;
    if v_adopter_profile_id is null or v_supporter_id is null then
      raise exception 'Adopter profile not found';
    end if;
  elsif v_identity_kind = 'existing_supporter' then
    v_supporter_id := (p_identity->>'supporterId')::uuid;
    if not exists (select 1 from public.supporter where id = v_supporter_id and deleted_at is null) then
      raise exception 'Supporter not found';
    end if;
    select id into v_adopter_profile_id
    from public.adopter_profile
    where supporter_id = v_supporter_id;
    if v_adopter_profile_id is null then
      insert into public.adopter_profile (
        supporter_id,
        name_english,
        name_chinese,
        address,
        household_size
      )
      values (
        v_supporter_id,
        nullif(p_identity#>>'{adopterProfile,nameEnglish}', ''),
        nullif(p_identity#>>'{adopterProfile,nameChinese}', ''),
        nullif(p_identity#>>'{adopterProfile,address}', ''),
        nullif(p_identity#>>'{adopterProfile,householdSize}', '')
      )
      returning id into v_adopter_profile_id;
    end if;
  elsif v_identity_kind = 'new_supporter' then
    insert into public.supporter (
      name,
      email,
      phone,
      language,
      source
    )
    values (
      p_identity#>>'{supporter,name}',
      nullif(p_identity#>>'{supporter,email}', ''),
      p_identity#>>'{supporter,phone}',
      coalesce(nullif(p_identity#>>'{supporter,language}', ''), 'zh-HK'),
      'manual_adoption_intake'
    )
    returning id into v_supporter_id;

    insert into public.adopter_profile (
      supporter_id,
      name_english,
      name_chinese,
      address,
      household_size
    )
    values (
      v_supporter_id,
      nullif(p_identity#>>'{adopterProfile,nameEnglish}', ''),
      nullif(p_identity#>>'{adopterProfile,nameChinese}', ''),
      nullif(p_identity#>>'{adopterProfile,address}', ''),
      nullif(p_identity#>>'{adopterProfile,householdSize}', '')
    )
    returning id into v_adopter_profile_id;
  else
    raise exception 'Invalid manual intake identity';
  end if;

  insert into public.supporter_role (supporter_id, role)
  values (v_supporter_id, 'adopter')
  on conflict (supporter_id, role) do nothing;

  insert into public.adoption_case (
    status_id,
    requested_animal_id,
    animal_type,
    applicant_name,
    applicant_phone,
    applicant_email,
    applicant_address,
    housing_type,
    family_size,
    existing_pets,
    reason,
    supporter_id,
    adopter_profile_id,
    preferences,
    source,
    created_by
  )
  values (
    (p_case->>'initialStatusId')::uuid,
    nullif(p_case->>'requestedAnimalId', '')::uuid,
    p_case->>'animalType',
    p_case->>'applicantName',
    p_case->>'applicantPhone',
    nullif(p_case->>'applicantEmail', ''),
    nullif(p_case->>'applicantAddress', ''),
    nullif(p_case->>'housingType', ''),
    nullif(p_case->>'familySize', '')::int,
    nullif(p_case->>'existingPets', ''),
    nullif(p_case->>'reason', ''),
    v_supporter_id,
    v_adopter_profile_id,
    coalesce(p_case->'preferences', '{}'::jsonb),
    'manual_intake',
    p_actor_user_id
  )
  returning id into v_case_id;

  if not exists (
    select 1
    from public.adoption_case
    where id = v_case_id
      and source = 'manual_intake'
  ) then
    raise exception 'Manual intake source not set';
  end if;

  if p_initial_task is not null then
    insert into public.adoption_followup (
      adoption_case_id,
      adopter_profile_id,
      animal_id,
      status_id,
      title,
      task_type,
      priority,
      due_at,
      assigned_to,
      volunteer,
      contact_channel,
      remarks,
      created_by,
      updated_by
    )
    values (
      v_case_id,
      v_adopter_profile_id,
      nullif(p_case->>'requestedAnimalId', '')::uuid,
      (p_initial_task->>'statusId')::uuid,
      p_initial_task->>'title',
      coalesce(nullif(p_initial_task->>'taskType', ''), 'followup'),
      coalesce(nullif(p_initial_task->>'priority', ''), 'normal'),
      nullif(p_initial_task->>'dueAt', '')::timestamptz,
      nullif(p_initial_task->>'assignedTo', ''),
      nullif(p_initial_task->>'volunteer', ''),
      nullif(p_initial_task->>'contactChannel', ''),
      nullif(p_initial_task->>'remarks', ''),
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_task_id;
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    timestamp,
    detail
  )
  values (
    p_actor_user_id,
    'coordinator_manual_intake.create',
    'adoption_case',
    v_case_id::text,
    now(),
    jsonb_build_object(
      'source', 'manual_intake',
      'supporterId', v_supporter_id,
      'adopterProfileId', v_adopter_profile_id,
      'requestedAnimalId', nullif(p_case->>'requestedAnimalId', ''),
      'initialStatusId', p_case->>'initialStatusId',
      'createdInitialTask', v_task_id is not null,
      'initialTaskId', v_task_id
    )
  );

  return jsonb_build_object(
    'caseId', v_case_id,
    'supporterId', v_supporter_id,
    'adopterProfileId', v_adopter_profile_id,
    'taskId', v_task_id
  );
end;
$$;
