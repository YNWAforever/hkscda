alter table public.donation
  add column if not exists acquisition_source text,
  add column if not exists acquisition_context text,
  add column if not exists acquisition_placement text,
  add column if not exists acquisition_trigger text;

alter table public.donation drop constraint if exists donation_acquisition_source_check;
alter table public.donation add constraint donation_acquisition_source_check
  check (acquisition_source is null or acquisition_source = 'contextual-cta');
alter table public.donation drop constraint if exists donation_acquisition_context_check;
alter table public.donation add constraint donation_acquisition_context_check
  check (acquisition_context is null or acquisition_context in ('general','story','animal','sponsor','transparency','community'));
alter table public.donation drop constraint if exists donation_acquisition_placement_check;
alter table public.donation add constraint donation_acquisition_placement_check
  check (acquisition_placement is null or acquisition_placement in ('mobile-bottom','desktop-left'));
alter table public.donation drop constraint if exists donation_acquisition_trigger_check;
alter table public.donation add constraint donation_acquisition_trigger_check
  check (acquisition_trigger is null or acquisition_trigger in ('scroll','timer'));
