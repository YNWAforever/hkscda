-- Make the animal admin-mutation audit trail atomic, stop it copying staff-only
-- row content into a table a wider role can read, and extend the trigger to the
-- remaining tables whose grants make a browser-direct write reachable.
--
-- Three problems with 20260803120000_audit_animal_mutations.sql and the two
-- /api/admin/adoptions/animals routes that shipped alongside it:
--
-- 1. Disclosure. audit_log is readable by staff, treasurer and admin ("staff can
--    read audit log", 20260623160506). animal_profile_internal is readable by
--    staff and admin only ("staff can manage internal animal profiles",
--    20260626140914). Writing the whole row into audit_log.detail therefore
--    handed a treasurer the internal_remarks / chip_remarks / desex_remarks they
--    are denied at the source table. adoption_applications carries adopter PII
--    under the same asymmetry. Both now log which columns changed, never the
--    values — that still answers "who changed what, when" without relaying
--    content across the role boundary.
--
-- 2. Atomicity. The routes issued the mutation and the audit_log insert as two
--    separate PostgREST calls, so a failure on the second left the mutation
--    committed and unaudited while returning 500 to the caller — the exact gap
--    the trigger exists to close, since service-role writes have auth.uid() null
--    and the trigger skips them. Both now go through one function in one
--    transaction, following mutate_document_asset_with_audit (20260719120000).
--
-- 3. Before-values. The app-layer rows recorded only the post-mutation value, so
--    "what was it changed from" was unanswerable for every service-role write.
--    The RPCs emit the same {'changed': ...} detail the trigger already uses,
--    and the same <table>.<op> action names, so one audit query covers both
--    write paths instead of having to union two conventions.

-- Redact values for tables whose rows are readable by a narrower set of roles
-- than audit_log itself. Everything else keeps the previous behaviour.
create or replace function public.log_animal_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity text := tg_table_name;
  v_entity_id text;
  v_detail jsonb;
  -- audit_log has its own, wider reader set than these tables: it admits every
  -- treasurer, while these hold staff-only notes or applicant/adopter personal
  -- data. Copying their values here would relay that content across the role
  -- boundary the source table draws, so only column names cross into audit_log.
  v_redacted boolean := tg_table_name in (
    'animal_profile_internal', 'adoption_applications', 'adopter_profile'
  );
begin
  if auth.uid() is null then
    return null; -- ignored for AFTER triggers; see the scope note in 20260803120000.
  end if;

  -- animal_profile_internal has no `id` column — its primary key is
  -- animal_id (references public.animals(id)). Every other audited table
  -- keys off `id`. Pick the right column per table rather than assuming `id`
  -- everywhere.
  if tg_table_name = 'animal_profile_internal' then
    v_entity_id := coalesce(new.animal_id, old.animal_id)::text;
  else
    v_entity_id := coalesce(new.id, old.id)::text;
  end if;

  if tg_op = 'DELETE' then
    v_detail := case
      when v_redacted then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(old)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object('old', to_jsonb(old))
    end;
  elsif tg_op = 'UPDATE' then
    -- Store only the columns that actually changed; whole-row snapshots on every
    -- edit would bloat audit_log for no diagnostic gain.
    v_detail := jsonb_build_object(
      'changed',
      (
        select coalesce(
          case
            when v_redacted then jsonb_agg(key order by key)
            else jsonb_object_agg(key, jsonb_build_object('from', old_row.value, 'to', new_row.value))
          end,
          case when v_redacted then '[]'::jsonb else '{}'::jsonb end
        )
        from jsonb_each(to_jsonb(old)) as old_row(key, value)
        join jsonb_each(to_jsonb(new)) as new_row(key, value) using (key)
        where old_row.value is distinct from new_row.value
      )
    );
  else
    v_detail := case
      when v_redacted then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(new)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object('new', to_jsonb(new))
    end;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    auth.uid(),
    v_entity || '.' || lower(tg_op),
    v_entity,
    v_entity_id,
    v_detail
  );

  return null; -- ignored for AFTER row-level triggers regardless of value.
end;
$$;

comment on function public.log_animal_mutation() is
  'Writes an audit_log row for direct-from-browser (anon/authenticated JWT) writes to the tables that grant authenticated writes and gate them on an admin role. Service-role writes are skipped — those paths already write their own actor-attributed audit_log row. Values are redacted to column names for tables audit_log is readable by a wider role than the table itself.';

-- Every remaining table that pairs `grant ... to authenticated` with an RLS
-- policy that lets an `authenticated` JWT write it. An admin session in the
-- browser reaches all of these over PostgREST directly, which is exactly the
-- precondition that left public.animals unaudited. "No component writes it
-- today" is a property of our UI, not of the privilege, so it was never a safe
-- reason to leave the trigger off — the tables whose authenticated policy is
-- select-only (supporter_role, message, webhook_event, audit_log) are the only
-- ones where the grant really is inert.
--
-- Every one of these keys off `id`, so log_animal_mutation() needs no new
-- special case. Service-role writes — which is all of production's write
-- traffic here — still short-circuit on the auth.uid() guard, so this is a
-- no-op for the webhook, repository, and RPC paths.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'coordinator_status', 'living_area', 'arrival_source', 'animal_position',
    'admin_user', 'adoption_applications',
    'supporter', 'consent', 'donation', 'payment', 'receipt', 'message_template',
    'adopter_profile', 'adoption_case', 'adoption_fee', 'adoption_followup',
    'adoption_attachment', 'successful_adoption', 'coordinator_status_history'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || v_table, v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.log_animal_mutation()',
      'audit_' || v_table,
      v_table
    );
  end loop;
end;
$$;

-- Atomic mutation + audit for the two service-role animal routes. security
-- invoker + a pinned empty search_path matches mutate_document_asset_with_audit;
-- the caller is the service role, which bypasses RLS.
create or replace function public.update_animal_status_with_audit(
  p_actor_user_id uuid,
  p_animal_id uuid,
  p_status text,
  p_updated_at timestamptz
)
returns setof public.animals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_status text;
  v_row public.animals;
begin
  select status into v_old_status
  from public.animals
  where id = p_animal_id
  for update;

  if not found then
    return; -- empty result; the caller turns that into a 404.
  end if;

  update public.animals
  set status = p_status,
      updated_at = p_updated_at
  where id = p_animal_id
  returning * into v_row;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (
    p_actor_user_id,
    'animals.update',
    'animals',
    p_animal_id::text,
    p_updated_at,
    jsonb_build_object(
      'changed',
      jsonb_build_object('status', jsonb_build_object('from', v_old_status, 'to', p_status))
    )
  );

  return next v_row;
end;
$$;

create or replace function public.upsert_animal_internal_profile_with_audit(
  p_actor_user_id uuid,
  p_animal_id uuid,
  p_values jsonb
)
returns setof public.animal_profile_internal
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb;
  v_input public.animal_profile_internal;
  v_row public.animal_profile_internal;
begin
  select to_jsonb(existing) into v_old
  from public.animal_profile_internal as existing
  where existing.animal_id = p_animal_id
  for update;

  v_input := jsonb_populate_record(null::public.animal_profile_internal, p_values);

  insert into public.animal_profile_internal (
    animal_id, internal_code, arrival_date, arrival_source_id, current_position_id,
    cage, has_chip, chip_remarks, is_desexed, desexed_at, desex_remarks,
    is_adoptable, is_inside_support_pool, adopted_at, deceased_at, internal_remarks
  )
  values (
    p_animal_id, v_input.internal_code, v_input.arrival_date, v_input.arrival_source_id,
    v_input.current_position_id, v_input.cage, v_input.has_chip, v_input.chip_remarks,
    v_input.is_desexed, v_input.desexed_at, v_input.desex_remarks, v_input.is_adoptable,
    v_input.is_inside_support_pool, v_input.adopted_at, v_input.deceased_at,
    v_input.internal_remarks
  )
  on conflict (animal_id) do update set
    internal_code = excluded.internal_code,
    arrival_date = excluded.arrival_date,
    arrival_source_id = excluded.arrival_source_id,
    current_position_id = excluded.current_position_id,
    cage = excluded.cage,
    has_chip = excluded.has_chip,
    chip_remarks = excluded.chip_remarks,
    is_desexed = excluded.is_desexed,
    desexed_at = excluded.desexed_at,
    desex_remarks = excluded.desex_remarks,
    is_adoptable = excluded.is_adoptable,
    is_inside_support_pool = excluded.is_inside_support_pool,
    adopted_at = excluded.adopted_at,
    deceased_at = excluded.deceased_at,
    internal_remarks = excluded.internal_remarks
  returning * into v_row;

  -- Column names only: audit_log is readable by treasurer, this table is not.
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when v_old is null then 'animal_profile_internal.insert' else 'animal_profile_internal.update' end,
    'animal_profile_internal',
    p_animal_id::text,
    case
      when v_old is null then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(v_row)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object(
        'changed',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(v_old) as old_row(key, value)
          join jsonb_each(to_jsonb(v_row)) as new_row(key, value) using (key)
          where old_row.value is distinct from new_row.value
        )
      )
    end
  );

  return next v_row;
end;
$$;

grant execute on function public.update_animal_status_with_audit(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.upsert_animal_internal_profile_with_audit(uuid, uuid, jsonb)
  to service_role;
