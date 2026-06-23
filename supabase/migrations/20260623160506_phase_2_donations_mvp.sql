create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;

create table if not exists public.admin_user (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email citext not null unique,
  role text not null check (role in ('staff', 'treasurer', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supporter (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null unique,
  phone text,
  language text not null default 'zh-HK' check (language in ('zh-HK', 'en')),
  tags text[] not null default '{}',
  source text not null default 'donation_form',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supporter_role (
  supporter_id uuid not null references public.supporter(id) on delete cascade,
  role text not null check (role in ('donor', 'adopter', 'volunteer', 'foster')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (supporter_id, role)
);

create table if not exists public.consent (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  status text not null check (status in ('opt_in', 'opt_out')),
  source text not null,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_mandate (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  amount_cents integer not null check (amount_cents > 0),
  provider text not null check (provider in ('stripe', 'paypal')),
  provider_ref text not null,
  status text not null default 'active' check (status in ('active', 'failed', 'cancelled')),
  next_charge_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create table if not exists public.donation (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'HKD' check (currency = 'HKD'),
  purpose text not null check (purpose in ('general', 'medical', 'sponsor')),
  type text not null default 'one_time' check (type in ('one_time', 'recurring')),
  recurring_id uuid references public.recurring_mandate(id),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  method text not null check (method in ('stripe', 'payme', 'fps', 'paypal', 'manual')),
  receipt_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donation(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'payme', 'fps', 'paypal', 'manual')),
  provider_ref text,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  received_at timestamptz,
  reconciled_by uuid,
  bank_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_provider_ref_idx
  on public.payment(provider, provider_ref)
  where provider_ref is not null;

create table if not exists public.receipt_sequence (
  tax_year integer primary key,
  next_value integer not null default 1 check (next_value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  receipt_no text not null unique,
  donation_ids uuid[] not null,
  total_amount_cents integer not null check (total_amount_cents > 0),
  tax_year integer not null,
  issued_at timestamptz not null default now(),
  pdf_url text,
  status text not null default 'issued' check (status in ('issued', 'void')),
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_template (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  language text not null check (language in ('zh-HK', 'en')),
  subject text,
  body text not null,
  variables text[] not null default '{}',
  whatsapp_meta_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, channel, language)
);

create table if not exists public.message (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  channel text not null check (channel in ('email', 'whatsapp')),
  template_id uuid references public.message_template(id),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'paypal', 'payme', 'fps', 'resend', 'whatsapp')),
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  timestamp timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.has_admin_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_user au
    where au.auth_user_id = (select auth.uid())
      and au.status = 'active'
      and au.role = any(allowed_roles)
  );
$$;

revoke all on function private.has_admin_role(text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_admin_role(text[]) to authenticated;

create or replace function private.allocate_receipt_number(p_tax_year integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allocated_sequence integer;
begin
  insert into public.receipt_sequence (tax_year, next_value)
  values (p_tax_year, 2)
  on conflict (tax_year) do update
    set next_value = public.receipt_sequence.next_value + 1,
        updated_at = now()
  returning next_value - 1 into allocated_sequence;

  return 'HKSCDA-' || p_tax_year || '-' || lpad(allocated_sequence::text, 6, '0');
end;
$$;

revoke all on function private.allocate_receipt_number(integer) from public;
grant execute on function private.allocate_receipt_number(integer) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_user',
    'supporter',
    'supporter_role',
    'consent',
    'recurring_mandate',
    'donation',
    'payment',
    'receipt_sequence',
    'receipt',
    'message_template',
    'message',
    'webhook_event',
    'audit_log'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.admin_user enable row level security;
alter table public.supporter enable row level security;
alter table public.supporter_role enable row level security;
alter table public.consent enable row level security;
alter table public.recurring_mandate enable row level security;
alter table public.donation enable row level security;
alter table public.payment enable row level security;
alter table public.receipt_sequence enable row level security;
alter table public.receipt enable row level security;
alter table public.message_template enable row level security;
alter table public.message enable row level security;
alter table public.webhook_event enable row level security;
alter table public.audit_log enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert on public.supporter to anon;
grant select, insert on public.consent to anon;
grant select, insert on public.supporter_role to anon;
grant select, insert on public.donation to anon;
grant select, insert on public.payment to anon;

create policy "admin users can view their own role"
  on public.admin_user for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);

create policy "admins can manage admin users"
  on public.admin_user for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read supporters"
  on public.supporter for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "staff can update supporters"
  on public.supporter for update
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']))
  with check (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "staff can read supporter roles"
  on public.supporter_role for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "staff can read consents"
  on public.consent for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "staff can update consents"
  on public.consent for update
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']))
  with check (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "staff can read donations"
  on public.donation for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "treasurers can update donations"
  on public.donation for update
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']))
  with check (private.has_admin_role(array['treasurer', 'admin']));

create policy "staff can read payments"
  on public.payment for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "treasurers can reconcile payments"
  on public.payment for update
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']))
  with check (private.has_admin_role(array['treasurer', 'admin']));

create policy "treasurers can manage receipts"
  on public.receipt for all
  to authenticated
  using (private.has_admin_role(array['treasurer', 'admin']))
  with check (private.has_admin_role(array['treasurer', 'admin']));

create policy "admins can manage templates"
  on public.message_template for all
  to authenticated
  using (private.has_admin_role(array['admin']))
  with check (private.has_admin_role(array['admin']));

create policy "staff can read messages"
  on public.message for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

create policy "admins can read webhook events"
  on public.webhook_event for select
  to authenticated
  using (private.has_admin_role(array['admin']));

create policy "staff can read audit log"
  on public.audit_log for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "treasurers can read receipt PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and private.has_admin_role(array['treasurer', 'admin'])
  );
