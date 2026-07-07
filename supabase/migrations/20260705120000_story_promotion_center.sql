create table if not exists public.content_item (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  type text not null check (type in ('rescue_story', 'event', 'charity_market', 'report')),
  title text not null,
  subtitle text,
  summary text not null,
  body text,
  cover_media_id uuid,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  cta_label text,
  cta_url text,
  seo_title text,
  seo_description text,
  og_title text,
  og_description text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create table if not exists public.content_link (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  linked_type text not null check (linked_type in ('animal', 'adoption_case', 'successful_adoption', 'supporter', 'volunteer_activity')),
  linked_id uuid not null,
  relationship text not null default 'other' check (relationship in ('primary_subject', 'related_case', 'adopter', 'volunteer_context', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, linked_type, linked_id, relationship)
);

create unique index if not exists content_link_one_primary_animal_idx
  on public.content_link (content_item_id)
  where linked_type = 'animal' and relationship = 'primary_subject';

create table if not exists public.rescue_story_profile (
  content_item_id uuid primary key references public.content_item(id) on delete cascade,
  animal_type text not null check (animal_type in ('cat', 'dog', 'mixed', 'unknown')),
  public_status text not null check (public_status in ('rescued', 'medical_care', 'foster_recovery', 'ready_for_adoption', 'adopted', 'sponsor_needed', 'closed')),
  rescue_region text not null,
  rescue_date date,
  show_on_map boolean not null default false,
  public_map_label text,
  public_lat numeric(9, 6),
  public_lng numeric(9, 6),
  internal_address text,
  internal_location_notes text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_lat is null or public_lat between -90 and 90),
  check (public_lng is null or public_lng between -180 and 180),
  check (
    show_on_map = false or
    (public_map_label is not null and public_lat is not null and public_lng is not null)
  )
);

create table if not exists public.story_update (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  kind text not null check (kind in ('medical', 'care', 'photo', 'foster', 'adoption', 'general')),
  title text not null,
  body text,
  occurred_at timestamptz not null,
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  should_generate_adopter_drafts boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, content_item_id)
);

create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  story_update_id uuid,
  storage_bucket text not null default 'content-media',
  storage_path text not null,
  alt_text text not null,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, content_item_id),
  unique (storage_bucket, storage_path),
  foreign key (story_update_id, content_item_id)
    references public.story_update(id, content_item_id)
    on delete cascade
);

alter table public.content_item
  drop constraint if exists content_item_cover_media_fk;

alter table public.content_item
  add constraint content_item_cover_media_fk
  foreign key (cover_media_id, id)
  references public.content_media(id, content_item_id)
  on delete set null (cover_media_id);

create table if not exists public.social_copy_variant (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  story_update_id uuid,
  platform text not null check (platform in ('facebook', 'instagram', 'whatsapp')),
  language text not null default 'zh-HK' check (language = 'zh-HK'),
  copy_text text not null,
  hashtags text[] not null default array[]::text[],
  status text not null default 'draft' check (status in ('draft', 'copied', 'archived')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (story_update_id, content_item_id)
    references public.story_update(id, content_item_id)
    on delete cascade
);

create table if not exists public.recipient_notification_draft (
  id uuid primary key default gen_random_uuid(),
  story_update_id uuid not null,
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  adoption_case_id uuid references public.adoption_case(id) on delete set null,
  supporter_id uuid references public.supporter(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_name text not null,
  recipient_contact text not null,
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'copied', 'sent_manually', 'dismissed')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (story_update_id, content_item_id)
    references public.story_update(id, content_item_id)
    on delete cascade
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'content_item',
    'content_link',
    'rescue_story_profile',
    'story_update',
    'content_media',
    'social_copy_variant',
    'recipient_notification_draft'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

create index if not exists content_item_status_type_published_idx
  on public.content_item (status, type, published_at desc);

create index if not exists content_item_slug_status_idx
  on public.content_item (slug, status);

create index if not exists content_link_content_idx
  on public.content_link (content_item_id, linked_type, relationship);

create index if not exists rescue_story_profile_region_status_idx
  on public.rescue_story_profile (rescue_region, public_status);

create index if not exists story_update_content_public_idx
  on public.story_update (content_item_id, visibility, occurred_at desc);

create index if not exists content_media_content_sort_idx
  on public.content_media (content_item_id, sort_order, created_at);

create index if not exists social_copy_content_platform_idx
  on public.social_copy_variant (content_item_id, platform, created_at desc);

create index if not exists recipient_notification_draft_update_status_idx
  on public.recipient_notification_draft (story_update_id, status);

alter table public.content_item enable row level security;
alter table public.content_link enable row level security;
alter table public.rescue_story_profile enable row level security;
alter table public.story_update enable row level security;
alter table public.content_media enable row level security;
alter table public.social_copy_variant enable row level security;
alter table public.recipient_notification_draft enable row level security;

grant select, insert, update, delete on public.content_item to service_role;
grant select, insert, update, delete on public.content_link to service_role;
grant select, insert, update, delete on public.rescue_story_profile to service_role;
grant select, insert, update, delete on public.story_update to service_role;
grant select, insert, update, delete on public.content_media to service_role;
grant select, insert, update, delete on public.social_copy_variant to service_role;
grant select, insert, update, delete on public.recipient_notification_draft to service_role;

revoke all on public.content_item from anon, authenticated;
revoke all on public.content_link from anon, authenticated;
revoke all on public.rescue_story_profile from anon, authenticated;
revoke all on public.story_update from anon, authenticated;
revoke all on public.content_media from anon, authenticated;
revoke all on public.social_copy_variant from anon, authenticated;
revoke all on public.recipient_notification_draft from anon, authenticated;

drop policy if exists "staff can manage content items" on public.content_item;
create policy "staff can manage content items"
  on public.content_item for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage content links" on public.content_link;
create policy "staff can manage content links"
  on public.content_link for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage rescue story profiles" on public.rescue_story_profile;
create policy "staff can manage rescue story profiles"
  on public.rescue_story_profile for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage story updates" on public.story_update;
create policy "staff can manage story updates"
  on public.story_update for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage content media" on public.content_media;
create policy "staff can manage content media"
  on public.content_media for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage social copy variants" on public.social_copy_variant;
create policy "staff can manage social copy variants"
  on public.social_copy_variant for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage recipient notification drafts" on public.recipient_notification_draft;
create policy "staff can manage recipient notification drafts"
  on public.recipient_notification_draft for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));
