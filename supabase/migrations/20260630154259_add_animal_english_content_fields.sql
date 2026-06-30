alter table public.animals
  add column if not exists age_en text,
  add column if not exists notes_en text,
  add column if not exists description_en text;

comment on column public.animals.age_en is 'Optional English age display text for admin-managed animal profiles.';
comment on column public.animals.notes_en is 'Optional English short note/tag for admin-managed animal profiles.';
comment on column public.animals.description_en is 'Optional English description for admin-managed animal profiles.';
