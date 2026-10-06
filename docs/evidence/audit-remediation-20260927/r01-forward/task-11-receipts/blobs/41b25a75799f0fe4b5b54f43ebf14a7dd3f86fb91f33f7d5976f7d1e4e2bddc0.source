create table adoption_applications (
  id             uuid        primary key default gen_random_uuid(),
  animal_id      uuid        references animals(id),
  animal_name    text        not null,
  animal_type    text        not null,
  applicant_name text        not null,
  phone          text        not null,
  email          text        not null,
  address        text        not null,
  housing_type   text        not null,
  family_size    integer,
  existing_pets  text,
  reason         text        not null,
  status         text        not null default 'pending'
                             check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz default now()
);

alter table adoption_applications enable row level security;

create policy "admin only"
  on adoption_applications for all
  using (auth.role() = 'authenticated');

create policy "public insert"
  on adoption_applications for insert
  with check (true);;
