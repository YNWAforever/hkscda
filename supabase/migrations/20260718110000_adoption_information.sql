alter table public.adoption_application_visit_preference
  add column if not exists dog_time_windows text[];

alter table public.adoption_application_visit_preference
  add column if not exists cat_time_windows text[];

create table if not exists public.adoption_fees (
  id uuid primary key default gen_random_uuid(),
  animal_type text not null check (animal_type in ('dog', 'cat')),
  item_name text not null check (char_length(item_name) between 1 and 180),
  price_hkd text not null check (char_length(price_hkd) between 1 and 40),
  sort_order integer not null check (sort_order >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (animal_type, sort_order)
);

create table if not exists public.dog_friendly_estates (
  id uuid primary key default gen_random_uuid(),
  estate_name text not null check (char_length(estate_name) between 1 and 180),
  district text not null check (char_length(district) between 1 and 120),
  notes text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adoption_fees_public_idx
  on public.adoption_fees (animal_type, is_published, sort_order);

create index if not exists dog_friendly_estates_public_idx
  on public.dog_friendly_estates (is_published, sort_order, estate_name);

alter table public.adoption_fees enable row level security;
alter table public.dog_friendly_estates enable row level security;

grant select, insert, update, delete on public.adoption_fees to service_role;
grant select, insert, update, delete on public.dog_friendly_estates to service_role;

revoke all on public.adoption_fees from anon, authenticated;
revoke all on public.dog_friendly_estates from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'adoption_fees',
    'dog_friendly_estates'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

insert into public.adoption_fees (
  animal_type,
  item_name,
  price_hkd,
  sort_order,
  is_published
)
values
  ('dog', 'Typical Species 一般品種', '1,000', 0, true),
  ('dog', 'Mongrel 唐狗', '0', 1, true),
  ('dog', 'PROHEART Injection', '300–600', 2, true),
  ('dog', '5-in-1 Vaccine', '250', 3, true),
  ('dog', 'Desex (Female)', '1,500–2,000', 4, true),
  ('dog', 'Desex (Male)', '1,000–1,500', 5, true),
  ('cat', 'Typical Species 一般品種', '1,000', 0, true),
  ('cat', 'DSH 唐貓', '500', 1, true),
  ('cat', '4-in-1 Vaccine', '250', 2, true),
  ('cat', 'Desex (Female)', '1,500–2,000', 3, true),
  ('cat', 'Desex (Male)', '1,000–1,500', 4, true),
  ('cat', 'Bath', '400', 5, true),
  ('cat', 'Small Cage', '150', 6, true),
  ('cat', 'Big Cage Rental', '400', 7, true)
on conflict (animal_type, sort_order) do update set
  item_name = excluded.item_name,
  price_hkd = excluded.price_hkd,
  is_published = excluded.is_published,
  updated_at = now();
