-- PostgREST exposes public, not private. Keep the transactional implementation private
-- and expose only this service-role entry point.
create or replace function public.create_manual_adoption_case(
  p_actor_user_id uuid,
  p_identity jsonb,
  p_case jsonb,
  p_initial_task jsonb default null
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select private.create_manual_adoption_case(
    p_actor_user_id,
    p_identity,
    p_case,
    p_initial_task
  );
$$;

revoke all on function public.create_manual_adoption_case(uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_manual_adoption_case(uuid,jsonb,jsonb,jsonb)
  to service_role;
