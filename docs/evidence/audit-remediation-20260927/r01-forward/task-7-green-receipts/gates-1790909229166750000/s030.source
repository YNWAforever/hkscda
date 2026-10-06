create or replace function private.enforce_published_site_document_slot_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_published then
    perform 1
    from public.document_assets
    where id = new.document_asset_id
      and is_published = true
    for update;

    if not found then
      raise exception 'Publish the PDF asset before publishing its site document slot'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_published_site_document_slot_asset on public.site_document_slots;
create constraint trigger enforce_published_site_document_slot_asset
after insert or update on public.site_document_slots
deferrable initially immediate
for each row execute function private.enforce_published_site_document_slot_asset();

create or replace function private.enforce_published_knowledge_document_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_asset_id uuid;
begin
  if new.is_published then
    for referenced_asset_id in
      select distinct refs.asset_id
      from unnest(array[
        new.document_asset_id,
        new.zh_hk_document_asset_id,
        new.en_document_asset_id
      ]) as refs(asset_id)
      where refs.asset_id is not null
      order by refs.asset_id
    loop
      perform 1
      from public.document_assets
      where id = referenced_asset_id
        and is_published = true
      for update;

      if not found then
        raise exception 'Publish the PDF asset before publishing its knowledge post'
          using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_published_knowledge_document_assets on public.knowledge_posts;
create constraint trigger enforce_published_knowledge_document_assets
after insert or update on public.knowledge_posts
deferrable initially immediate
for each row execute function private.enforce_published_knowledge_document_assets();

create or replace function private.protect_published_document_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_published and not new.is_published
    and (
      exists (
        select 1
        from public.site_document_slots
        where document_asset_id = new.id
          and is_published = true
      )
      or exists (
        select 1
        from public.knowledge_posts
        where is_published = true
          and new.id in (
            document_asset_id,
            zh_hk_document_asset_id,
            en_document_asset_id
          )
      )
    )
  then
    raise exception 'Unpublish public document references before unpublishing their PDF asset'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_published_document_references on public.document_assets;
create constraint trigger protect_published_document_references
after update on public.document_assets
deferrable initially immediate
for each row execute function private.protect_published_document_references();
