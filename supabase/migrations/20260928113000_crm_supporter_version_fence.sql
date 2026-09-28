-- Existing CRM tag bulk snapshots depend on supporter.edit_version.
-- Keep every supporter update visible to a pending snapshot, including edits
-- that do not change tags. A trigger overrides any caller-supplied version.
alter table public.supporter
  add column if not exists edit_version bigint not null default 1;

create or replace function private.bump_supporter_edit_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.edit_version := old.edit_version + 1;
  return new;
end $$;
revoke all on function private.bump_supporter_edit_version()
  from public, anon, authenticated, service_role;

drop trigger if exists bump_supporter_edit_version on public.supporter;
create trigger bump_supporter_edit_version
before update on public.supporter for each row
execute function private.bump_supporter_edit_version();
