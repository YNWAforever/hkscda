-- A verified photo-upload challenge grants one short-lived application attempt.
-- Keep the bearer status token out of this table; only its hash is stored.
create table if not exists public.adoption_upload_intent (
  application_id uuid primary key,
  photo_paths text[] not null
    check (cardinality(photo_paths) between 1 and 6),
  status_token_hash text not null unique
    check (status_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  constraint adoption_upload_intent_expiry_after_creation
    check (expires_at > created_at)
);

create index if not exists adoption_upload_intent_cleanup_idx
  on public.adoption_upload_intent (expires_at)
  where submitted_at is null;

alter table public.adoption_upload_intent enable row level security;
revoke all on public.adoption_upload_intent from public, anon, authenticated;
grant select, insert, update, delete on public.adoption_upload_intent to service_role;