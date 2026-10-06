alter table public.admin_user
  drop constraint if exists admin_user_status_check;

alter table public.admin_user
  add constraint admin_user_status_check
  check (status in ('pending', 'active', 'disabled'));

alter table public.admin_user
  add column if not exists invited_at timestamptz,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_accepted_at timestamptz,
  add column if not exists last_invited_by uuid references auth.users(id);

create index if not exists admin_user_status_updated_idx
  on public.admin_user (status, updated_at desc);

create index if not exists admin_user_invite_sent_idx
  on public.admin_user (invite_sent_at desc)
  where status = 'pending';
