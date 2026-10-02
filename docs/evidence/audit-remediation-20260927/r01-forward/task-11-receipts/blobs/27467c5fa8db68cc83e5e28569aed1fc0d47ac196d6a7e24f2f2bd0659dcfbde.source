-- Add the donor-facing AlipayHK method while storing its COD processor separately.
-- This migration only widens existing check constraints; it does not modify rows.

alter table public.donation drop constraint if exists donation_method_check;
alter table public.donation add constraint donation_method_check check
  (method in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'alipayhk'));

alter table public.payment drop constraint if exists payment_provider_check;
alter table public.payment add constraint payment_provider_check check
  (provider in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'cod'));

alter table public.webhook_event drop constraint if exists webhook_event_provider_check;
alter table public.webhook_event add constraint webhook_event_provider_check check
  (provider in ('stripe', 'paypal', 'payme', 'fps', 'resend', 'whatsapp', 'cod'));
