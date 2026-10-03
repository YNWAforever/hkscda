create table if not exists public.group_enquiries (
  id uuid primary key default gen_random_uuid(),
  organisation text not null check (char_length(organisation) between 1 and 180),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email citext not null,
  contact_phone text not null check (char_length(contact_phone) between 1 and 60),
  activity_type text not null check (activity_type in ('group_workshop', 'school_talk', 'shelter_visit', 'other')),
  other_activity_description text,
  participant_count integer check (participant_count is null or participant_count > 0),
  participant_age_profile text,
  preferred_date_notes text,
  message text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed')),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed')),
  notification_error text,
  assigned_to uuid references public.admin_user(id) on delete set null,
  admin_notes text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_enquiries_other_activity_description_check check (
    (activity_type = 'other' and nullif(btrim(other_activity_description), '') is not null)
    or (activity_type <> 'other' and other_activity_description is null)
  )
);

create table if not exists public.knowledge_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  topic text not null check (char_length(topic) between 1 and 120),
  short_intro text not null check (char_length(short_intro) between 1 and 500),
  external_url text,
  document_asset_id uuid references public.document_assets(id) on delete restrict,
  source_name text,
  is_published boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_posts_single_destination_check check (num_nonnulls(external_url, document_asset_id) = 1),
  constraint knowledge_posts_https_external_url_check check (
    external_url is null or external_url ~* '^https://'
  )
);

create index if not exists group_enquiries_status_created_idx
  on public.group_enquiries (status, created_at desc);

create index if not exists group_enquiries_notification_status_created_idx
  on public.group_enquiries (notification_status, created_at desc);

create index if not exists group_enquiries_assigned_status_idx
  on public.group_enquiries (assigned_to, status);

create index if not exists knowledge_posts_public_idx
  on public.knowledge_posts (is_published, sort_order, created_at desc);

create unique index if not exists knowledge_posts_external_url_unique_idx
  on public.knowledge_posts (external_url)
  where external_url is not null;

create unique index if not exists knowledge_posts_document_asset_id_unique_idx
  on public.knowledge_posts (document_asset_id)
  where document_asset_id is not null;

alter table public.group_enquiries enable row level security;
alter table public.knowledge_posts enable row level security;

grant select, insert, update, delete on public.group_enquiries to service_role;
grant select, insert, update, delete on public.knowledge_posts to service_role;

revoke all on public.group_enquiries from anon, authenticated;
revoke all on public.knowledge_posts from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'group_enquiries',
    'knowledge_posts'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

insert into public.knowledge_posts (
  title,
  topic,
  short_intro,
  external_url,
  source_name,
  is_published,
  sort_order
)
values
  (
    'HK01 pet care guide',
    'pet-care',
    'External reference for adopters and animal guardians.',
    'https://www.hk01.com/article/288651',
    'HK01',
    true,
    0
  ),
  (
    '10Life pet insurance comparison',
    'pet-insurance',
    'External reference comparing pet insurance coverage for Hong Kong pet owners.',
    'https://www.10life.com/zh-HK/blog/Pet-Owners-Alert-Comparing-Pet-Insurance-Coverage',
    '10Life',
    true,
    1
  )
on conflict (external_url) where external_url is not null do update set
  title = excluded.title,
  topic = excluded.topic,
  short_intro = excluded.short_intro,
  source_name = excluded.source_name,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  updated_at = now();
