-- A verified individual booking remains one person. Status-only admission checks
-- must not be bypassed by inflating the shape of an already approved row.
create function public.volunteer_policy_booking_shape_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.participant_count,new.registration_type) is distinct from (old.participant_count,old.registration_type)
 and exists(select 1 from public.volunteer_activity where id in (old.activity_id,new.activity_id) and policy_version_id is not null) then
  raise exception 'immutable_policy_booking_shape' using errcode='22023';
 end if;
 return new;
end; $$;
create trigger volunteer_policy_booking_shape before update on public.volunteer_registration
for each row execute function public.volunteer_policy_booking_shape_guard();
revoke all on function public.volunteer_policy_booking_shape_guard() from public,anon,authenticated;
