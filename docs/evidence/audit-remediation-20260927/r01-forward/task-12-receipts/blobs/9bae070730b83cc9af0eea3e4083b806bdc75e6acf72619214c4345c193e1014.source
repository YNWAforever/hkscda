create extension if not exists pgcrypto;

create table if not exists public.coordinator_status (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('adoption_case', 'animal_lifecycle', 'match', 'followup', 'final_outcome')),
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label_zh text not null,
  label_en text not null,
  sort_order integer not null default 0,
  color text not null default 'slate',
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_closing boolean not null default false,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, id),
  unique (category, key)
);

create table if not exists public.living_area (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arrival_source (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.animal_position (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'shelter' check (type in ('shelter', 'foster', 'clinic', 'partner', 'other')),
  for_cat boolean not null default true,
  for_dog boolean not null default true,
  address text,
  contact_person text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_fee (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adopter_profile (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null unique references public.supporter(id) on delete cascade,
  name_english text,
  name_chinese text,
  gender text check (gender in ('male', 'female', 'other')),
  hkid text,
  birthday date,
  occupation text,
  facebook text,
  household_size text,
  monthly_household_income text,
  living_area_id uuid references public.living_area(id),
  address text,
  floor_area text,
  is_blacklisted boolean not null default false,
  blacklist_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_case (
  id uuid primary key default gen_random_uuid(),
  public_application_id uuid unique references public.adoption_applications(id) on delete set null,
  status_category text not null default 'adoption_case' check (status_category = 'adoption_case'),
  status_id uuid not null,
  adopter_profile_id uuid references public.adopter_profile(id),
  supporter_id uuid references public.supporter(id),
  requested_animal_id uuid references public.animals(id),
  approved_animal_id uuid references public.animals(id),
  animal_type text not null default 'unknown',
  applicant_name text not null,
  applicant_phone text not null,
  applicant_email text,
  applicant_address text,
  housing_type text,
  family_size integer,
  existing_pets text,
  reason text,
  assessment jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  assigned_to uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (status_category, status_id) references public.coordinator_status(category, id)
);

create table if not exists public.animal_match (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null references public.adoption_case(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,
  status_category text not null default 'match' check (status_category = 'match'),
  status_id uuid not null,
  is_approved boolean not null default false,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (status_category, status_id) references public.coordinator_status(category, id),
  unique (adoption_case_id, animal_id)
);

create table if not exists public.successful_adoption (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null unique references public.adoption_case(id) on delete restrict,
  animal_id uuid not null references public.animals(id) on delete restrict,
  adopter_profile_id uuid not null references public.adopter_profile(id) on delete restrict,
  supporter_id uuid not null references public.supporter(id) on delete restrict,
  outcome_status_category text not null default 'final_outcome' check (outcome_status_category = 'final_outcome'),
  outcome_status_id uuid not null,
  case_number text not null unique,
  adoption_fee_cents integer check (adoption_fee_cents is null or adoption_fee_cents >= 0),
  approval_date date not null,
  pickup_date date,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outcome_status_category, outcome_status_id) references public.coordinator_status(category, id)
);

create table if not exists public.adoption_followup (
  id uuid primary key default gen_random_uuid(),
  adoption_case_id uuid not null references public.adoption_case(id) on delete cascade,
  status_category text not null default 'followup' check (status_category = 'followup'),
  status_id uuid not null,
  title text not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  has_window_net boolean,
  environment text,
  score text,
  volunteer text,
  remarks text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (status_category, status_id) references public.coordinator_status(category, id)
);

create table if not exists public.adoption_attachment (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('adoption_case', 'adopter_profile', 'animal', 'followup')),
  entity_id uuid not null,
  file_name text not null,
  storage_bucket text not null default 'adoption-files' check (storage_bucket = 'adoption-files'),
  storage_path text not null,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  is_sensitive boolean not null default true,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.coordinator_status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('adoption_case', 'animal_match', 'animal')),
  entity_id uuid not null,
  status_category text generated always as (
    case entity_type
      when 'adoption_case' then 'adoption_case'
      when 'animal_match' then 'match'
      when 'animal' then 'animal_lifecycle'
    end
  ) stored,
  status_id uuid not null,
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now(),
  foreign key (status_category, status_id) references public.coordinator_status(category, id)
);

create table if not exists public.animal_profile_internal (
  animal_id uuid primary key references public.animals(id) on delete cascade,
  internal_code text unique,
  arrival_date date,
  arrival_source_id uuid references public.arrival_source(id),
  current_position_id uuid references public.animal_position(id),
  cage text,
  has_chip boolean,
  chip_remarks text,
  is_desexed boolean,
  desexed_at date,
  desex_remarks text,
  is_adoptable boolean not null default true,
  is_inside_support_pool boolean not null default false,
  adopted_at date,
  deceased_at date,
  internal_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.coordinator_status
  (category, key, label_zh, label_en, sort_order, color, is_system, is_closing, is_final)
values
  ('adoption_case', 'new', '新申請', 'New', 10, 'blue', true, false, false),
  ('adoption_case', 'screening', '初步審核', 'Screening', 20, 'amber', true, false, false),
  ('adoption_case', 'contacted', '已聯絡', 'Contacted', 30, 'cyan', true, false, false),
  ('adoption_case', 'home_visit', '家訪', 'Home visit', 40, 'purple', true, false, false),
  ('adoption_case', 'matching', '配對中', 'Matching', 50, 'indigo', true, false, false),
  ('adoption_case', 'approved', '已批准', 'Approved', 60, 'green', true, true, true),
  ('adoption_case', 'rejected', '已拒絕', 'Rejected', 70, 'red', true, true, true),
  ('adoption_case', 'withdrawn', '已撤回', 'Withdrawn', 80, 'slate', true, true, true),
  ('adoption_case', 'closed', '已結案', 'Closed', 90, 'slate', true, true, true),
  ('animal_lifecycle', 'available', '可領養', 'Available', 10, 'green', true, false, false),
  ('animal_lifecycle', 'reserved', '已預留', 'Reserved', 20, 'amber', true, false, false),
  ('animal_lifecycle', 'fostered', '暫托中', 'Fostered', 30, 'blue', true, false, false),
  ('animal_lifecycle', 'adopted', '已領養', 'Adopted', 40, 'green', true, true, true),
  ('animal_lifecycle', 'not_adoptable', '暫不可領養', 'Not adoptable', 50, 'slate', true, false, false),
  ('animal_lifecycle', 'medical_hold', '醫療觀察', 'Medical hold', 60, 'red', true, false, false),
  ('animal_lifecycle', 'deceased', '已離世', 'Deceased', 70, 'slate', true, true, true),
  ('match', 'proposed', '建議配對', 'Proposed', 10, 'blue', true, false, false),
  ('match', 'shortlisted', '候選', 'Shortlisted', 20, 'amber', true, false, false),
  ('match', 'approved', '配對批准', 'Approved', 30, 'green', true, true, true),
  ('match', 'declined', '配對不合適', 'Declined', 40, 'red', true, true, true),
  ('match', 'cancelled', '已取消', 'Cancelled', 50, 'slate', true, true, true),
  ('followup', 'open', '待處理', 'Open', 10, 'blue', true, false, false),
  ('followup', 'scheduled', '已安排', 'Scheduled', 20, 'amber', true, false, false),
  ('followup', 'completed', '已完成', 'Completed', 30, 'green', true, true, true),
  ('followup', 'cancelled', '已取消', 'Cancelled', 40, 'slate', true, true, true),
  ('final_outcome', 'adopted', '成功領養', 'Adopted', 10, 'green', true, true, true),
  ('final_outcome', 'rejected', '不批准', 'Rejected', 20, 'red', true, true, true),
  ('final_outcome', 'withdrawn', '申請撤回', 'Withdrawn', 30, 'slate', true, true, true),
  ('final_outcome', 'cancelled', '已取消', 'Cancelled', 40, 'slate', true, true, true)
on conflict (category, key) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'coordinator_status',
    'living_area',
    'arrival_source',
    'animal_position',
    'adoption_fee',
    'adopter_profile',
    'adoption_case',
    'animal_match',
    'successful_adoption',
    'adoption_followup',
    'animal_profile_internal'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create index if not exists coordinator_status_category_sort_idx
  on public.coordinator_status (category, sort_order);

create index if not exists living_area_active_sort_idx
  on public.living_area (is_active, sort_order);

create index if not exists arrival_source_active_sort_idx
  on public.arrival_source (is_active, sort_order);

create index if not exists animal_position_active_type_idx
  on public.animal_position (is_active, type);

create index if not exists adoption_fee_active_created_idx
  on public.adoption_fee (is_active, created_at desc);

create index if not exists adopter_profile_living_area_idx
  on public.adopter_profile (living_area_id);

create index if not exists adopter_profile_blacklisted_idx
  on public.adopter_profile (is_blacklisted)
  where is_blacklisted = true;

create index if not exists adoption_case_status_created_idx
  on public.adoption_case (status_id, created_at desc);

create index if not exists adoption_case_supporter_idx
  on public.adoption_case (supporter_id);

create index if not exists adoption_case_adopter_profile_idx
  on public.adoption_case (adopter_profile_id);

create index if not exists adoption_case_requested_animal_idx
  on public.adoption_case (requested_animal_id);

create index if not exists adoption_case_approved_animal_idx
  on public.adoption_case (approved_animal_id);

create index if not exists adoption_case_assigned_created_idx
  on public.adoption_case (assigned_to, created_at desc);

create index if not exists adoption_case_processed_created_idx
  on public.adoption_case (processed, created_at desc);

create index if not exists animal_match_case_status_idx
  on public.animal_match (adoption_case_id, status_id);

create index if not exists animal_match_animal_status_idx
  on public.animal_match (animal_id, status_id);

create index if not exists successful_adoption_animal_idx
  on public.successful_adoption (animal_id);

create index if not exists successful_adoption_supporter_idx
  on public.successful_adoption (supporter_id);

create index if not exists successful_adoption_approval_date_idx
  on public.successful_adoption (approval_date desc);

create index if not exists adoption_followup_case_status_idx
  on public.adoption_followup (adoption_case_id, status_id);

create index if not exists adoption_followup_scheduled_idx
  on public.adoption_followup (scheduled_at)
  where completed_at is null;

create index if not exists adoption_attachment_entity_idx
  on public.adoption_attachment (entity_type, entity_id);

create index if not exists adoption_attachment_storage_path_idx
  on public.adoption_attachment (storage_bucket, storage_path);

create index if not exists coordinator_status_history_entity_created_idx
  on public.coordinator_status_history (entity_type, entity_id, created_at desc);

create index if not exists animal_profile_internal_arrival_source_idx
  on public.animal_profile_internal (arrival_source_id);

create index if not exists animal_profile_internal_position_idx
  on public.animal_profile_internal (current_position_id);

create index if not exists animal_profile_internal_adoptable_idx
  on public.animal_profile_internal (is_adoptable);

alter table public.coordinator_status enable row level security;
alter table public.living_area enable row level security;
alter table public.arrival_source enable row level security;
alter table public.animal_position enable row level security;
alter table public.adoption_fee enable row level security;
alter table public.adopter_profile enable row level security;
alter table public.adoption_case enable row level security;
alter table public.animal_match enable row level security;
alter table public.successful_adoption enable row level security;
alter table public.adoption_followup enable row level security;
alter table public.adoption_attachment enable row level security;
alter table public.coordinator_status_history enable row level security;
alter table public.animal_profile_internal enable row level security;

grant select, insert, update, delete on public.coordinator_status to authenticated;
grant select, insert, update, delete on public.living_area to authenticated;
grant select, insert, update, delete on public.arrival_source to authenticated;
grant select, insert, update, delete on public.animal_position to authenticated;
grant select, insert, update, delete on public.adoption_fee to authenticated;
grant select, insert, update, delete on public.adopter_profile to authenticated;
grant select, insert, update, delete on public.adoption_case to authenticated;
grant select, insert, update, delete on public.animal_match to authenticated;
grant select, insert, update, delete on public.successful_adoption to authenticated;
grant select, insert, update, delete on public.adoption_followup to authenticated;
grant select, insert, update, delete on public.adoption_attachment to authenticated;
grant select, insert on public.coordinator_status_history to authenticated;
grant select, insert, update, delete on public.animal_profile_internal to authenticated;

create policy "staff can read coordinator statuses"
  on public.coordinator_status for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can administer coordinator statuses"
  on public.coordinator_status for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read living areas"
  on public.living_area for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can manage living areas"
  on public.living_area for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read arrival sources"
  on public.arrival_source for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can manage arrival sources"
  on public.arrival_source for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read animal positions"
  on public.animal_position for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can manage animal positions"
  on public.animal_position for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read adoption fees"
  on public.adoption_fee for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "admins can manage adoption fees"
  on public.adoption_fee for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can manage adopter profiles"
  on public.adopter_profile for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption cases"
  on public.adoption_case for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage animal matches"
  on public.animal_match for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage successful adoptions"
  on public.successful_adoption for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption followups"
  on public.adoption_followup for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage adoption attachments"
  on public.adoption_attachment for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read status history"
  on public.coordinator_status_history for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can insert status history"
  on public.coordinator_status_history for insert
  to authenticated
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can manage internal animal profiles"
  on public.animal_profile_internal for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adoption-files',
  'adoption-files',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "staff can read adoption files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'adoption-files'
    and private.has_admin_role(array['staff', 'admin'])
  );

create policy "staff can upload adoption files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'adoption-files'
    and private.has_admin_role(array['staff', 'admin'])
  );

create policy "staff can update adoption files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'adoption-files'
    and private.has_admin_role(array['staff', 'admin'])
  )
  with check (
    bucket_id = 'adoption-files'
    and private.has_admin_role(array['staff', 'admin'])
  );
