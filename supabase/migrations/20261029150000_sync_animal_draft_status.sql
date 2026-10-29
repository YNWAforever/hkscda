-- BUG-01: a status set from the coordinator pipeline was undone by the next draft publish.
--
-- update_animal_status_with_audit (the pipeline's status route) wrote only
-- public.animals.status. animal_publication_command's publish branch then copied
-- status from the draft body it publishes, which still held the old value, so an
-- animal marked adopted in the pipeline went back to available - and onto the
-- public adoptable listing - when staff later published any edit to its profile.
--
-- The status RPC now also writes the new status into the animal's draft body and
-- bumps the draft revision, in the same transaction. Bumping the revision means a
-- preview made from the older draft no longer matches (publish answers conflict and
-- staff preview again, with the new status), and an editor still open on the older
-- revision gets the existing 409 on save and reloads. Animals without a draft, or
-- whose draft already holds this status, are left untouched.
--
-- Signature, security invoker and the empty search_path are unchanged; every
-- reference stays schema-qualified.

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
  v_draft_revision bigint;
begin
  -- Publication locks the draft before updating animals. Match that order even
  -- when the draft already holds p_status, or a concurrent publish can deadlock.
  perform 1
  from public.animal_draft
  where id = p_animal_id
  for update;

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

  -- Keep the draft in step so the next publish carries this status (BUG-01).
  update public.animal_draft
  set body = pg_catalog.jsonb_set(body, '{status}', pg_catalog.to_jsonb(p_status)),
      revision = revision + 1,
      updated_by = coalesce(p_actor_user_id, updated_by),
      updated_at = pg_catalog.clock_timestamp()
  where id = p_animal_id
    and body ->> 'status' is distinct from p_status
  returning revision into v_draft_revision;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (
    p_actor_user_id,
    'animals.update',
    'animals',
    p_animal_id::text,
    p_updated_at,
    pg_catalog.jsonb_build_object(
      'changed',
      pg_catalog.jsonb_build_object(
        'status', pg_catalog.jsonb_build_object('from', v_old_status, 'to', p_status)
      ),
      'draft_revision', v_draft_revision
    )
  );

  return next v_row;
end;
$$;

-- Unchanged from the baseline: server-authenticated actors only.
revoke execute on function public.update_animal_status_with_audit(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.update_animal_status_with_audit(uuid, uuid, text, timestamptz)
  to service_role;
