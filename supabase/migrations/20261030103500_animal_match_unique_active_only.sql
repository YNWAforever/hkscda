-- BUG-42 (schema part): one ACTIVE match per case and animal, not one match ever.
--
-- 20260626140914 declared `unique (adoption_case_id, animal_id)` on animal_match, so once a
-- match was declined or cancelled the same animal could never be re-matched to the same case:
-- the insert in the match-create branch of mutate_adoption_coordinator_with_audit
-- (20261030103000) hit 23505 even though its duplicate guard had allowed it. The intended rule
-- is the guard's: a declined or cancelled (closing, not approved) match does not block a new
-- match; only an active one does. A match is active when
--     is_approved or not status.is_closing or status.key = 'approved'
-- (the exact predicate of the 20261030103000 duplicate guard).
--
-- A partial unique index cannot read coordinator_status, so the predicate is materialised in
-- animal_match.is_active_match:
--   * a BEFORE INSERT OR UPDATE trigger on animal_match always recomputes it from the row's
--     status (callers cannot set it directly);
--   * an AFTER UPDATE trigger on coordinator_status recomputes it for the matches of a match
--     status whose key or is_closing changed. If that would leave two active matches for one
--     case and animal, the status edit is refused by the unique index (23505).
-- The blanket constraint is then replaced by a partial unique index on the active rows, and a
-- plain index keeps the (case, animal) lookup the guard uses. Existing data already satisfies
-- the new invariant, because the old constraint allowed only one row per pair.
-- No RPC, grant or policy changes. Backfill keeps updated_at (set_updated_at is paused for it).

alter table public.animal_match
  add column if not exists is_active_match boolean not null default true;

create or replace function private.animal_match_is_active(p_is_approved boolean, p_status_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_is_approved, false)
    or coalesce((
      select not status.is_closing or status.key = 'approved'
      from public.coordinator_status status
      where status.id = p_status_id
    ), true)
$$;

create or replace function private.animal_match_set_is_active_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_active_match := private.animal_match_is_active(new.is_approved, new.status_id);
  return new;
end;
$$;

create or replace function private.coordinator_status_resync_animal_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category = 'match'
    and (new.key is distinct from old.key or new.is_closing is distinct from old.is_closing)
  then
    -- The BEFORE trigger on animal_match recomputes the flag; only rows whose flag changes
    -- are touched.
    update public.animal_match m
    set is_active_match = private.animal_match_is_active(m.is_approved, m.status_id)
    where m.status_id = new.id
      and m.is_active_match is distinct from (
        m.is_approved or not new.is_closing or new.key = 'approved'
      );
  end if;
  return null;
end;
$$;

revoke all on function private.animal_match_is_active(boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function private.animal_match_set_is_active_match() from public, anon, authenticated, service_role;
revoke all on function private.coordinator_status_resync_animal_match() from public, anon, authenticated, service_role;

drop trigger if exists animal_match_set_is_active_match on public.animal_match;
create trigger animal_match_set_is_active_match
  before insert or update on public.animal_match
  for each row execute function private.animal_match_set_is_active_match();

drop trigger if exists coordinator_status_resync_animal_match on public.coordinator_status;
create trigger coordinator_status_resync_animal_match
  after update of key, is_closing on public.coordinator_status
  for each row execute function private.coordinator_status_resync_animal_match();

-- Backfill without bumping updated_at (no audit row is written either: auth.uid() is null).
alter table public.animal_match disable trigger set_updated_at;
update public.animal_match m
set is_active_match = private.animal_match_is_active(m.is_approved, m.status_id)
where m.is_active_match is distinct from private.animal_match_is_active(m.is_approved, m.status_id);
alter table public.animal_match enable trigger set_updated_at;

alter table public.animal_match
  drop constraint if exists animal_match_adoption_case_id_animal_id_key;

create unique index if not exists animal_match_one_active_per_case_animal
  on public.animal_match (adoption_case_id, animal_id)
  where is_active_match;

create index if not exists animal_match_case_animal_idx
  on public.animal_match (adoption_case_id, animal_id);
