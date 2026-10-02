create table if not exists public.sponsorship_pledge (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  monthly_tier text not null check (monthly_tier in ('100', '300', '500', 'custom')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'HKD',
  language text not null check (language in ('zh-HK', 'en')),
  notes text,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'provisional', 'active', 'needs_followup', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsorship_preference (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references public.sponsorship_pledge(id) on delete cascade,
  sponsor_animal_id uuid references public.animals(id) on delete set null,
  rank integer not null check (rank between 1 and 10),
  animal_name_snapshot text not null,
  animal_type_snapshot text not null check (animal_type_snapshot in ('sponsor')),
  created_at timestamptz not null default now(),
  unique (pledge_id, rank),
  unique (pledge_id, sponsor_animal_id)
);

create table if not exists public.sponsorship_payment_proof (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null unique references public.sponsorship_pledge(id) on delete cascade,
  storage_bucket text not null default 'sponsorship-payment-proof' check (storage_bucket = 'sponsorship-payment-proof'),
  storage_path text not null,
  file_name text not null,
  file_type text not null check (file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer not null check (file_size > 0 and file_size <= 8388608),
  payment_method text not null check (payment_method in ('fps', 'bank_transfer', 'payme', 'paypal', 'give_asia')),
  reference text,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

do $$
begin
  execute 'drop trigger if exists set_updated_at on public.sponsorship_pledge';
  execute 'create trigger set_updated_at before update on public.sponsorship_pledge for each row execute function public.set_updated_at()';
end $$;

create index if not exists sponsorship_pledge_supporter_idx
  on public.sponsorship_pledge (supporter_id);

create index if not exists sponsorship_pledge_status_idx
  on public.sponsorship_pledge (status);

create index if not exists sponsorship_preference_pledge_rank_idx
  on public.sponsorship_preference (pledge_id, rank);

alter table public.sponsorship_pledge enable row level security;
alter table public.sponsorship_preference enable row level security;
alter table public.sponsorship_payment_proof enable row level security;

grant select on public.sponsorship_pledge to authenticated;
grant select on public.sponsorship_preference to authenticated;
grant select on public.sponsorship_payment_proof to authenticated;

grant select, insert, update, delete on public.sponsorship_pledge to service_role;
grant select, insert, update, delete on public.sponsorship_preference to service_role;
grant select, insert, update, delete on public.sponsorship_payment_proof to service_role;

revoke all on public.sponsorship_pledge from anon;
revoke all on public.sponsorship_preference from anon;
revoke all on public.sponsorship_payment_proof from anon;

create policy "staff can read sponsorship pledges"
  on public.sponsorship_pledge for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read sponsorship preferences"
  on public.sponsorship_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read sponsorship payment proofs"
  on public.sponsorship_payment_proof for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsorship-payment-proof',
  'sponsorship-payment-proof',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "staff can read sponsorship payment proof files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sponsorship-payment-proof'
    and private.has_admin_role(array['staff', 'admin'])
  );

alter table public.public_status_token
  drop constraint if exists public_status_token_entity_type_check;

alter table public.public_status_token
  add constraint public_status_token_entity_type_check check (entity_type in ('adoption_application', 'sponsorship_pledge'));
