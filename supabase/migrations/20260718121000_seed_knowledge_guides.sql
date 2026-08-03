do $$
declare
  zh_asset_id uuid;
  en_asset_id uuid;
begin
  select document_asset_id
    into zh_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'zh-HK'
    and is_published = true;

  select document_asset_id
    into en_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'en'
    and is_published = true;

  if zh_asset_id is null then
    raise exception 'Missing published zh-HK post_adoption_guide document slot';
  end if;
  if en_asset_id is null then
    raise exception 'Missing published en post_adoption_guide document slot';
  end if;

  insert into public.knowledge_posts (
    title,
    topic,
    short_intro,
    document_asset_id,
    source_name,
    is_published,
    sort_order
  )
  values
    (
      '領養後須知',
      'adoption',
      '領養後照顧及適應期的重要資訊。',
      zh_asset_id,
      'HKSCDA',
      true,
      10
    ),
    (
      'What you need to know after adopting a cat',
      'adoption',
      'A practical guide for settling in and caring for a newly adopted cat.',
      en_asset_id,
      'HKSCDA',
      true,
      11
    )
  on conflict (document_asset_id) where document_asset_id is not null do update set
    title = excluded.title,
    topic = excluded.topic,
    short_intro = excluded.short_intro,
    source_name = excluded.source_name,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order,
    updated_at = now();
end $$;
