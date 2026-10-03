alter table public.webhook_event
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_expires_at timestamptz,
  add column if not exists processing_owner text;

create index if not exists webhook_event_processing_idx
  on public.webhook_event (provider, provider_event_id, processed_at, processing_expires_at);
