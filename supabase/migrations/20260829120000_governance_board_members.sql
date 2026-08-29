create table if not exists public.board_member (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  role_title text not null check (char_length(role_title) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  effective_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_member_public_idx
  on public.board_member (is_active, sort_order);

alter table public.board_member enable row level security;

grant select, insert, update, delete on public.board_member to service_role;

revoke all on public.board_member from anon, authenticated;

drop trigger if exists set_updated_at on public.board_member;
create trigger set_updated_at before update on public.board_member
  for each row execute function public.set_updated_at();
