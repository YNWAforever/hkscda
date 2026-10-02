-- A publish must commit before its reviewed private images become public.
-- The immutable publication version queues the copies in the same transaction;
-- an interrupted HTTP response can then be repaired by the cron.
create table public.animal_publication_media_copy (
  public_path text primary key,
  publication_version_id uuid not null references public.animal_publication_version(id),
  animal_id uuid not null references public.animals(id),
  source_path text not null,
  public_url text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  copied_at timestamptz,
  copy_claimed_at timestamptz,
  constraint animal_publication_media_source_path
    check (source_path like animal_id::text || '/%'),
  constraint animal_publication_media_public_path
    check (public_path like animal_id::text || '/versions/%')
);

create index animal_publication_media_copy_pending_idx
  on public.animal_publication_media_copy (created_at)
  where copied_at is null;

alter table public.animal_publication_media_copy enable row level security;
revoke all on public.animal_publication_media_copy from public, anon, authenticated;
grant select, insert, update on public.animal_publication_media_copy to service_role;

create function public.queue_animal_publication_media_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_url text;
  v_public_path text;
begin
  if new.body->>'publication_state' is distinct from 'published' then
    return new;
  end if;

  for v_source, v_url in
    select media.source_path, media.public_url
    from (
      select nullif(new.body->>'draft_image_path', '') as source_path,
             nullif(new.body->>'image_url', '') as public_url
      union all
      select nullif(item->>'draft_path', '') as source_path,
             nullif(item->>'url', '') as public_url
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(new.body->'gallery') = 'array'
          then new.body->'gallery'
          else '[]'::jsonb
        end
      ) as item
      where item->>'review_status' = 'approved'
    ) as media
    where media.source_path is not null and media.public_url is not null
  loop
    v_public_path := pg_catalog.split_part(
      v_url, '/storage/v1/object/public/animal-images/', 2
    );
    if v_public_path not like new.animal_id::text || '/versions/%'
      or v_public_path like '%?%'
      or v_public_path like '%#%'
    then
      raise exception 'invalid animal publication media path' using errcode = '22023';
    end if;

    insert into public.animal_publication_media_copy (
      public_path, publication_version_id, animal_id, source_path, public_url
    ) values (
      v_public_path, new.id, new.animal_id, v_source, v_url
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.queue_animal_publication_media_copy()
  from public, anon, authenticated;
grant execute on function public.queue_animal_publication_media_copy()
  to service_role;

create trigger animal_publication_media_copy_queued
  after insert on public.animal_publication_version
  for each row execute function public.queue_animal_publication_media_copy();

create function public.claim_due_animal_publication_media_copies(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (source_path text, public_path text, claimed_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select media.public_path
    from public.animal_publication_media_copy as media
    where media.copied_at is null
      and media.created_at < p_cutoff
      and (
        media.copy_claimed_at is null
        or media.copy_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by media.created_at, media.public_path
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.animal_publication_media_copy as media
  set copy_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where media.public_path = candidates.public_path
  returning media.source_path, media.public_path, media.copy_claimed_at;
$$;

revoke all on function public.claim_due_animal_publication_media_copies(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_animal_publication_media_copies(timestamptz, integer)
  to service_role;

create function public.mark_animal_publication_media_copied(
  p_public_path text,
  p_claimed_at timestamptz default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.animal_publication_media_copy
  set copied_at = pg_catalog.clock_timestamp(),
      copy_claimed_at = null
  where public_path = p_public_path
    and copied_at is null
    and (
      (p_claimed_at is null and copy_claimed_at is null)
      or copy_claimed_at = p_claimed_at
    );
  if found then return true; end if;
  return exists(
    select 1 from public.animal_publication_media_copy
    where public_path = p_public_path and copied_at is not null
  );
end;
$$;

revoke all on function public.mark_animal_publication_media_copied(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_animal_publication_media_copied(text, timestamptz)
  to service_role;
