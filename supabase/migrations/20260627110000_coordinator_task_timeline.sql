alter table public.adoption_followup
  drop constraint if exists adoption_followup_adoption_case_id_not_null;

alter table public.adoption_followup
  alter column adoption_case_id drop not null,
  add column if not exists adopter_profile_id uuid references public.adopter_profile(id) on delete set null,
  add column if not exists animal_id uuid references public.animals(id) on delete set null,
  add column if not exists task_type text not null default 'followup',
  add column if not exists priority text not null default 'normal',
  add column if not exists due_at timestamptz,
  add column if not exists assigned_to text,
  add column if not exists contact_channel text,
  add column if not exists outcome text,
  add column if not exists next_step_at timestamptz;

alter table public.adoption_followup
  drop constraint if exists adoption_followup_link_required,
  add constraint adoption_followup_link_required
    check (
      adoption_case_id is not null
      or adopter_profile_id is not null
      or animal_id is not null
    );

alter table public.adoption_followup
  drop constraint if exists adoption_followup_priority_check,
  add constraint adoption_followup_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.adoption_followup
  drop constraint if exists adoption_followup_contact_channel_check,
  add constraint adoption_followup_contact_channel_check
    check (
      contact_channel is null
      or contact_channel in ('phone', 'whatsapp', 'email', 'in_person', 'internal')
    );

create index if not exists adoption_followup_status_due_idx
  on public.adoption_followup (status_id, due_at);

create index if not exists adoption_followup_case_due_idx
  on public.adoption_followup (adoption_case_id, due_at);

create index if not exists adoption_followup_adopter_due_idx
  on public.adoption_followup (adopter_profile_id, due_at);

create index if not exists adoption_followup_animal_due_idx
  on public.adoption_followup (animal_id, due_at);

create index if not exists adoption_followup_assigned_due_idx
  on public.adoption_followup (assigned_to, due_at);

create index if not exists adoption_followup_overdue_idx
  on public.adoption_followup (due_at)
  where completed_at is null;
