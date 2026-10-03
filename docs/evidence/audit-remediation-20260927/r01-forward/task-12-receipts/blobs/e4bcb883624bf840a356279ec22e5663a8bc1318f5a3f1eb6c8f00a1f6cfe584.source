create extension if not exists pgcrypto;

create table if not exists public.adoption_application_detail (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  language text not null check (language in ('zh-HK', 'en')),
  preferred_contact_method text not null check (preferred_contact_method in ('phone', 'whatsapp', 'email')),
  household_size integer check (household_size is null or household_size > 0),
  landlord_restrictions text,
  window_door_safety text not null,
  indoor_space_notes text,
  home_modifications_possible boolean,
  current_pets text,
  pet_care_experience text,
  household_agreement text not null,
  daily_schedule text not null,
  monthly_budget_hkd integer check (monthly_budget_hkd is null or monthly_budget_hkd >= 0),
  emergency_care_plan text not null,
  terms_version text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  questionnaire jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_application_animal_preference (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null references public.adoption_applications(id) on delete cascade,
  rank integer not null check (rank between 1 and 3),
  animal_id uuid references public.animals(id) on delete set null,
  animal_name_snapshot text not null,
  animal_type_snapshot text not null check (animal_type_snapshot in ('cat', 'dog')),
  created_at timestamptz not null default now(),
  unique (public_application_id, rank),
  unique (public_application_id, animal_id)
);

create table if not exists public.adoption_application_visit_preference (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  date_range_start date not null,
  date_range_end date not null,
  preferred_time_windows text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  check (date_range_end >= date_range_start),
  check (array_length(preferred_time_windows, 1) is not null)
);

create table if not exists public.adoption_application_photo (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null references public.adoption_applications(id) on delete cascade,
  storage_bucket text not null default 'adoption-application-photos' check (storage_bucket = 'adoption-application-photos'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  photo_category text not null check (photo_category in ('home', 'window', 'living')),
  uploaded_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.public_status_token (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  entity_type text not null check (entity_type in ('adoption_application')),
  entity_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  check (expires_at > created_at)
);

create table if not exists public.adoption_intake_item (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid not null unique references public.adoption_applications(id) on delete cascade,
  adoption_case_id uuid references public.adoption_case(id) on delete set null,
  lane text not null check (lane in ('new_adoption_application', 'visit_followup', 'photos_to_review', 'needs_followup')),
  urgency text not null default 'normal' check (urgency in ('normal', 'high', 'overdue')),
  summary jsonb not null default '{}'::jsonb,
  due_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'adoption_application_detail',
    'adoption_intake_item'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create index if not exists adoption_application_preference_app_rank_idx
  on public.adoption_application_animal_preference (public_application_id, rank);

create index if not exists adoption_application_photo_app_category_idx
  on public.adoption_application_photo (public_application_id, photo_category);

create index if not exists public_status_token_entity_idx
  on public.public_status_token (entity_type, entity_id);

create index if not exists public_status_token_expires_idx
  on public.public_status_token (expires_at)
  where revoked_at is null;

create index if not exists adoption_intake_item_lane_due_idx
  on public.adoption_intake_item (lane, due_at)
  where resolved_at is null;

create index if not exists adoption_intake_item_case_idx
  on public.adoption_intake_item (adoption_case_id);

alter table public.adoption_application_detail enable row level security;
alter table public.adoption_application_animal_preference enable row level security;
alter table public.adoption_application_visit_preference enable row level security;
alter table public.adoption_application_photo enable row level security;
alter table public.public_status_token enable row level security;
alter table public.adoption_intake_item enable row level security;

grant select on public.adoption_application_detail to authenticated;
grant select on public.adoption_application_animal_preference to authenticated;
grant select on public.adoption_application_visit_preference to authenticated;
grant select on public.adoption_application_photo to authenticated;
grant select on public.adoption_intake_item to authenticated;

grant select, insert, update, delete on public.adoption_application_detail to service_role;
grant select, insert, update, delete on public.adoption_application_animal_preference to service_role;
grant select, insert, update, delete on public.adoption_application_visit_preference to service_role;
grant select, insert, update, delete on public.adoption_application_photo to service_role;
grant select, insert, update, delete on public.public_status_token to service_role;
grant select, insert, update, delete on public.adoption_intake_item to service_role;

revoke all on public.adoption_application_detail from anon;
revoke all on public.adoption_application_animal_preference from anon;
revoke all on public.adoption_application_visit_preference from anon;
revoke all on public.adoption_application_photo from anon;
revoke all on public.public_status_token from anon, authenticated;
revoke all on public.adoption_intake_item from anon;

create policy "staff can read public adoption details"
  on public.adoption_application_detail for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption animal preferences"
  on public.adoption_application_animal_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption visit preferences"
  on public.adoption_application_visit_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read public adoption photo metadata"
  on public.adoption_application_photo for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read adoption intake items"
  on public.adoption_intake_item for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adoption-application-photos',
  'adoption-application-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "staff can read adoption application photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'adoption-application-photos'
    and private.has_admin_role(array['staff', 'admin'])
  );
