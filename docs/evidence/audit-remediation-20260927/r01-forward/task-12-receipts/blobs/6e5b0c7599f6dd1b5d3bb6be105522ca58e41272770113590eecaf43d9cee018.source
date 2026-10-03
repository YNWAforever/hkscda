-- Persist COD's merchant order_ref. The API documents this as the supported
-- key for order_details; transaction_details does not support out_trade_no.

alter table public.payment
  add column if not exists provider_order_ref text;

create unique index if not exists payment_provider_order_ref_idx
  on public.payment(provider, provider_order_ref)
  where provider_order_ref is not null;
