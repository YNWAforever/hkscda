create table if not exists public.document_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('annual_report', 'wedding_form', 'adoption_guide')),
  title text not null check (char_length(title) between 1 and 180),
  language text not null check (language in ('zh-HK', 'en', 'bilingual')),
  bucket_name text not null default 'site-documents',
  object_path text not null unique check (object_path !~ '(^/|\.\.)'),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_document_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null check (slot_key ~ '^[a-z0-9_]+$'),
  language text not null check (language in ('zh-HK', 'en')),
  document_asset_id uuid not null references public.document_assets(id) on delete restrict,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_key, language)
);

create table if not exists public.annual_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  year_label text not null unique,
  document_asset_id uuid not null references public.document_assets(id) on delete restrict,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_config (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.donation add column if not exists custom_purpose text;
alter table public.donation drop constraint if exists donation_custom_purpose_length_check;
alter table public.donation add constraint donation_custom_purpose_length_check
  check (custom_purpose is null or char_length(custom_purpose) <= 200);

create index if not exists document_assets_public_idx
  on public.document_assets (kind, is_published, sort_order, created_at desc);
create index if not exists annual_reports_public_idx
  on public.annual_reports (is_published, sort_order, created_at desc);

alter table public.document_assets enable row level security;
alter table public.site_document_slots enable row level security;
alter table public.annual_reports enable row level security;
alter table public.site_config enable row level security;

grant select, insert, update, delete on public.document_assets to service_role;
grant select, insert, update, delete on public.site_document_slots to service_role;
grant select, insert, update, delete on public.annual_reports to service_role;
grant select, insert, update, delete on public.site_config to service_role;
revoke all on public.document_assets from anon, authenticated;
revoke all on public.site_document_slots from anon, authenticated;
revoke all on public.annual_reports from anon, authenticated;
revoke all on public.site_config from anon, authenticated;

drop policy if exists "staff can manage document assets" on public.document_assets;
create policy "staff can manage document assets"
  on public.document_assets for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage site document slots" on public.site_document_slots;
create policy "staff can manage site document slots"
  on public.site_document_slots for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage annual reports" on public.annual_reports;
create policy "staff can manage annual reports"
  on public.annual_reports for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage site config" on public.site_config;
create policy "staff can manage site config"
  on public.site_config for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'document_assets',
    'site_document_slots',
    'annual_reports',
    'site_config'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-documents', 'site-documents', true, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.site_config (key, value)
values ('donation_receipt_template_url', null)
on conflict (key) do nothing;
