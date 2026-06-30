create table animals (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null check (type in ('cat', 'dog', 'sponsor')),
  name        text        not null,
  name_en     text,
  gender      text        not null check (gender in ('male', 'female')),
  age         text        not null,
  description text,
  notes       text,
  status      text        not null default 'available'
                          check (status in ('available', 'adopted', 'fostered')),
  image_url   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table animals enable row level security;

create policy "public read available"
  on animals for select
  using (status = 'available');

create policy "admin full access"
  on animals for all
  using (auth.role() = 'authenticated');;
