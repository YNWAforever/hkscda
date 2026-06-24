create extension if not exists pg_trgm;

create index if not exists supporter_active_name_trgm_idx
  on public.supporter using gin (name gin_trgm_ops)
  where deleted_at is null;

create index if not exists supporter_active_phone_trgm_idx
  on public.supporter using gin (phone gin_trgm_ops)
  where deleted_at is null
    and phone is not null;

create index if not exists supporter_tags_gin_idx
  on public.supporter using gin (tags);

create index if not exists supporter_deleted_at_idx
  on public.supporter (deleted_at);

create index if not exists supporter_role_role_supporter_idx
  on public.supporter_role (role, supporter_id);

create index if not exists consent_supporter_channel_timestamp_idx
  on public.consent (supporter_id, channel, timestamp desc);

create index if not exists donation_supporter_created_idx
  on public.donation (supporter_id, created_at desc);

create index if not exists donation_purpose_created_idx
  on public.donation (purpose, created_at desc);

create index if not exists donation_receipt_requested_created_idx
  on public.donation (created_at desc)
  where receipt_requested = true;

create index if not exists payment_donation_status_created_idx
  on public.payment (donation_id, status, created_at desc);

create index if not exists payment_provider_ref_trgm_idx
  on public.payment using gin (provider_ref gin_trgm_ops)
  where provider_ref is not null;

create index if not exists payment_bank_reference_trgm_idx
  on public.payment using gin (bank_reference gin_trgm_ops)
  where bank_reference is not null;

create index if not exists receipt_no_trgm_idx
  on public.receipt using gin (receipt_no gin_trgm_ops);

create index if not exists receipt_supporter_status_issued_idx
  on public.receipt (supporter_id, status, issued_at desc);

create index if not exists message_supporter_created_idx
  on public.message (supporter_id, created_at desc);

create index if not exists audit_entity_id_timestamp_idx
  on public.audit_log (entity_id, timestamp desc);

create index if not exists audit_action_timestamp_idx
  on public.audit_log (action, timestamp desc);
