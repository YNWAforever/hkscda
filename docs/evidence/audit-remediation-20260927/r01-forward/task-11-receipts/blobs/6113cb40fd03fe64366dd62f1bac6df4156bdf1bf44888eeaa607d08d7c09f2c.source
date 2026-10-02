-- Audit direct-from-browser writes to the animal tables, at the database layer.
--
-- AnimalForm and AnimalsTable write to public.animals DIRECTLY from the
-- browser with the anon client (guarded only by RLS), bypassing the
-- repository layer that writes an audit_log row for every other admin
-- mutation. Those writes were completely unaudited.
--
-- Fixing this in the client would only cover today's call sites, and an
-- application-layer audit is bypassed by the very path that caused the gap.
-- A trigger covers every writer: the direct client path, a future API
-- handler, and the SQL console alike.
--
-- Scope: the trigger only fires when auth.uid() is present, i.e. the write
-- carries a real end-user JWT (the anon/authenticated browser-direct path —
-- the actual gap this migration closes). Writes made over the service-role
-- connection (auth.uid() is null; every /api/admin/* route) are skipped
-- here entirely, because those routes already resolve the real actor via
-- requireAdmin and write their own, correctly-attributed audit_log row
-- (see src/lib/adoptions/service.ts createMatch, and the insertAuditLog
-- call added alongside this migration for the animal_profile_internal
-- route). Auditing service-role writes here too would either duplicate an
-- audit_log row that already has the real actor (animal_match), or record a
-- second, actor-less row that undercuts the specific actor identity the
-- app-layer call already has in hand — worse than not logging at all.

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
begin
  if auth.uid() is null then
    return null; -- ignored for AFTER triggers; see the scope note above.
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
    v_detail := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    -- Store only the columns that actually changed; whole-row snapshots on every
    -- edit would bloat audit_log for no diagnostic gain.
    v_detail := jsonb_build_object(
      'changed',
      (
        select coalesce(jsonb_object_agg(key, jsonb_build_object('from', old_row.value, 'to', new_row.value)), '{}'::jsonb)
        from jsonb_each(to_jsonb(old)) as old_row(key, value)
        join jsonb_each(to_jsonb(new)) as new_row(key, value) using (key)
        where old_row.value is distinct from new_row.value
      )
    );
  else
    v_detail := jsonb_build_object('new', to_jsonb(new));
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
  'Writes an audit_log row for direct-from-browser (anon/authenticated JWT) writes to the animal tables. Service-role writes are skipped — those routes already write their own actor-attributed audit_log row.';

drop trigger if exists audit_animals on public.animals;
create trigger audit_animals
  after insert or update or delete on public.animals
  for each row execute function public.log_animal_mutation();

drop trigger if exists audit_animal_profile_internal on public.animal_profile_internal;
create trigger audit_animal_profile_internal
  after insert or update or delete on public.animal_profile_internal
  for each row execute function public.log_animal_mutation();

drop trigger if exists audit_animal_match on public.animal_match;
create trigger audit_animal_match
  after insert or update or delete on public.animal_match
  for each row execute function public.log_animal_mutation();
