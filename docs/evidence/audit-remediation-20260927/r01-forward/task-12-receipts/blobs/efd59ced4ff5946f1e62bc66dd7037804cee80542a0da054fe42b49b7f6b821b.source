-- Enforce canonical animal eligibility in the same transaction as preference insertion.
create or replace function public.enforce_current_animal_preference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.animals%rowtype;
begin
 select * into a from public.animals where id=case when tg_table_name='sponsorship_preference' then new.sponsor_animal_id else new.animal_id end for key share;
 if not found or a.retired_at is not null or a.publication_state<>'published' or a.status not in('available','fostered') then raise exception 'animal_not_currently_public' using errcode='23514'; end if;
 if tg_table_name='sponsorship_preference' then
  if not a.sponsorship_eligible or new.animal_type_snapshot<>a.type then raise exception 'animal_not_sponsorship_eligible' using errcode='23514'; end if;
 else
  if not a.adoption_eligible or a.type not in('cat','dog') or new.animal_type_snapshot<>a.type then raise exception 'animal_not_adoption_eligible' using errcode='23514'; end if;
 end if;
 return new;
end $$;
drop trigger if exists enforce_current_adoption_animal on public.adoption_application_animal_preference;
create trigger enforce_current_adoption_animal before insert on public.adoption_application_animal_preference for each row execute function public.enforce_current_animal_preference();
drop trigger if exists enforce_current_sponsorship_animal on public.sponsorship_preference;
create trigger enforce_current_sponsorship_animal before insert on public.sponsorship_preference for each row execute function public.enforce_current_animal_preference();
revoke all on function public.enforce_current_animal_preference() from public,anon,authenticated;
