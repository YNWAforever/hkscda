-- Public checkout intents are replayable after client, provider, or database timeouts.
-- Existing donations and payments remain untouched and keep nullable keys.
alter table public.donation
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_fingerprint text;

create unique index if not exists donation_idempotency_key_idx
  on public.donation (idempotency_key)
  where idempotency_key is not null;

alter table public.donation
  add constraint donation_idempotency_fingerprint_check
  check (
    (idempotency_key is null and idempotency_fingerprint is null)
    or (idempotency_key is not null and idempotency_fingerprint ~ '^[0-9a-f]{64}$')
  );

alter table public.payment
  add column if not exists idempotency_key uuid,
  add column if not exists checkout_url text,
  add column if not exists checkout_attempted_at timestamptz;

create unique index if not exists payment_idempotency_key_idx
  on public.payment (idempotency_key)
  where idempotency_key is not null;