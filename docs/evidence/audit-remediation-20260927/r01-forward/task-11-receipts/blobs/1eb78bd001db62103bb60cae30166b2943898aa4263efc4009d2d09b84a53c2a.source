create table if not exists public.volunteer_activity (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('volunteer_shift', 'group_activity', 'cleaning_day')),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  capacity integer not null check (capacity > 0),
  min_age integer check (min_age is null or min_age >= 0),
  underage_policy text not null default 'allow_with_guardian_pending' check (underage_policy in ('block', 'allow_with_guardian_pending')),
  auto_approve boolean not null default false,
  allow_waitlist boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'cancelled')),
  registration_modes text[] not null default array['individual']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (array_length(registration_modes, 1) is not null),
  check (registration_modes <@ array['individual', 'group']::text[])
);

create table if not exists public.volunteer_registration (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.volunteer_activity(id) on delete cascade,
  supporter_id uuid references public.supporter(id) on delete set null,
  registration_type text not null check (registration_type in ('individual', 'group')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'waitlisted', 'rejected', 'cancelled')),
  status_reason text,
  attendance_status text not null default 'not_marked' check (attendance_status in ('not_marked', 'attended', 'completed', 'no_show')),
  participant_count integer not null check (participant_count > 0),
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  language text not null default 'zh-HK' check (language in ('zh-HK', 'en')),
  organization_name text,
  declared_age integer check (declared_age is null or declared_age >= 0),
  youngest_age integer check (youngest_age is null or youngest_age >= 0),
  guardian_name text,
  guardian_phone text,
  notes text,
  internal_notes text,
  volunteer_hours numeric(6, 2) check (volunteer_hours is null or volunteer_hours >= 0),
  status_token_hash text not null unique,
  status_token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  execute 'drop trigger if exists set_updated_at on public.volunteer_activity';
  execute 'create trigger set_updated_at before update on public.volunteer_activity for each row execute function public.set_updated_at()';
  execute 'drop trigger if exists set_updated_at on public.volunteer_registration';
  execute 'create trigger set_updated_at before update on public.volunteer_registration for each row execute function public.set_updated_at()';
end $$;

create index if not exists volunteer_activity_status_starts_idx
  on public.volunteer_activity (status, starts_at);

create index if not exists volunteer_activity_type_starts_idx
  on public.volunteer_activity (type, starts_at);

create index if not exists volunteer_registration_activity_status_idx
  on public.volunteer_registration (activity_id, status);

create index if not exists volunteer_registration_supporter_idx
  on public.volunteer_registration (supporter_id);

create index if not exists volunteer_registration_status_created_idx
  on public.volunteer_registration (status, created_at desc);

create index if not exists volunteer_registration_token_idx
  on public.volunteer_registration (status_token_hash);

create or replace function public.create_volunteer_registration(
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
  p_status_token_expires_at timestamptz
) returns public.volunteer_registration
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_activity public.volunteer_activity%rowtype;
  v_approved_participants integer := 0;
  v_age integer;
  v_has_guardian boolean;
  v_status text := 'pending';
  v_reason text := 'manual_review';
  v_registration public.volunteer_registration%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text, 0));

  select *
    into v_activity
    from public.volunteer_activity
   where id = p_activity_id
   for update;

  if not found then
    raise exception 'Volunteer activity not found' using errcode = 'P0002';
  end if;

  v_age := case
    when p_registration_type = 'group' then p_youngest_age
    else p_declared_age
  end;
  v_has_guardian :=
    nullif(btrim(coalesce(p_guardian_name, '')), '') is not null and
    nullif(btrim(coalesce(p_guardian_phone, '')), '') is not null;

  if v_activity.status <> 'published' or v_activity.starts_at <= now() then
    v_status := 'pending';
    v_reason := 'activity_not_available';
  elsif not (p_registration_type = any(v_activity.registration_modes)) then
    v_status := 'pending';
    v_reason := 'registration_mode_unavailable';
  elsif p_registration_type = 'group' and (
    nullif(btrim(coalesce(p_organization_name, '')), '') is null or
    not v_has_guardian
  ) then
    v_status := 'pending';
    v_reason := 'manual_review';
  elsif p_registration_type = 'individual' and p_participant_count <> 1 then
    v_status := 'pending';
    v_reason := 'manual_review';
  elsif v_activity.min_age is not null and v_age is not null and v_age < v_activity.min_age then
    if v_activity.underage_policy = 'block' then
      v_status := 'rejected';
      v_reason := 'minimum_age_not_met';
    elsif v_has_guardian then
      v_status := 'pending';
      v_reason := 'guardian_review_required';
    else
      v_status := 'pending';
      v_reason := 'guardian_details_required';
    end if;
  else
    select coalesce(sum(participant_count), 0)::integer
      into v_approved_participants
      from public.volunteer_registration
     where activity_id = p_activity_id
       and status = 'approved';

    if p_participant_count > greatest(0, v_activity.capacity - v_approved_participants) then
      v_status := case when v_activity.allow_waitlist then 'waitlisted' else 'pending' end;
      v_reason := 'capacity_full';
    elsif not v_activity.auto_approve then
      v_status := 'pending';
      v_reason := 'manual_review';
    else
      v_status := 'approved';
      v_reason := 'auto_approved';
    end if;
  end if;

  insert into public.volunteer_registration (
    activity_id,
    supporter_id,
    registration_type,
    status,
    status_reason,
    participant_count,
    contact_name,
    contact_email,
    contact_phone,
    language,
    organization_name,
    declared_age,
    youngest_age,
    guardian_name,
    guardian_phone,
    notes,
    status_token_hash,
    status_token_expires_at
  ) values (
    p_activity_id,
    p_supporter_id,
    p_registration_type,
    v_status,
    v_reason,
    p_participant_count,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_language,
    p_organization_name,
    p_declared_age,
    p_youngest_age,
    p_guardian_name,
    p_guardian_phone,
    p_notes,
    p_status_token_hash,
    p_status_token_expires_at
  )
  returning * into v_registration;

  return v_registration;
end;
$$;

revoke all on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer, text, text, text, text, timestamptz
) to service_role;

alter table public.volunteer_activity enable row level security;
alter table public.volunteer_registration enable row level security;

grant select on public.volunteer_activity to anon;
grant select, insert, update, delete on public.volunteer_activity to service_role;
grant select, insert, update, delete on public.volunteer_registration to service_role;

revoke all on public.volunteer_activity from authenticated;
revoke all on public.volunteer_registration from anon, authenticated;
revoke all on public.volunteer_registration from authenticated;

drop policy if exists "public can read published volunteer activities" on public.volunteer_activity;
create policy "public can read published volunteer activities"
  on public.volunteer_activity for select
  to anon
  using (status = 'published');

drop policy if exists "staff can read volunteer activities" on public.volunteer_activity;
create policy "staff can read volunteer activities"
  on public.volunteer_activity for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can read volunteer registrations" on public.volunteer_registration;
create policy "staff can read volunteer registrations"
  on public.volunteer_registration for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

alter table public.public_status_token
  drop constraint if exists public_status_token_entity_type_check;

alter table public.public_status_token
  add constraint public_status_token_entity_type_check check (entity_type in ('adoption_application', 'sponsorship_pledge', 'volunteer_registration'));
