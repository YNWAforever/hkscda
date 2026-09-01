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

  -- On a genuinely fresh database (local dev, CI, a disaster-recovery
  -- restore drill) no document has ever been published into this slot --
  -- that only happens through the admin CMS release workflow added later
  -- (20260731120000_adoption_guide_release_cms.sql). Rather than aborting
  -- migration replay entirely, create a placeholder document + slot so a
  -- fresh database ends up with a real (if placeholder) guide row,
  -- matching the schema's own invariants. Staging/production already have
  -- this migration recorded as applied against a real published document,
  -- so this branch never runs there -- Supabase never re-applies a
  -- migration that has already succeeded.
  --
  -- The placeholder is inserted with is_published = false in both tables:
  -- it must never become live-servable to a real visitor if a fresh
  -- database were ever mistakenly exposed to traffic (RLS only grants
  -- anon/authenticated read access where is_published = true -- see
  -- 20260719223000_public_document_read_policies.sql -- and the public
  -- knowledge listing filters on document_assets.is_published = true, so an
  -- unpublished placeholder never appears on /knowledge either). This
  -- doesn't block the real publish flow later: publish_adoption_guide_release
  -- (20260731120000_adoption_guide_release_cms.sql) reads the slot's
  -- document_asset_id unconditionally, with no is_published filter, when
  -- looking for a prior asset to supersede, so it will still find and
  -- correctly replace this unpublished placeholder once staff publish a
  -- real guide through the admin CMS.
  if zh_asset_id is null then
    insert into public.document_assets (
      kind, title, language, object_path, byte_size, is_published
    )
    values (
      'adoption_guide',
      '領養後須知（預設佔位文件）',
      'zh-HK',
      'placeholder/post-adoption-guide-zh-hk.pdf',
      1,
      false
    )
    returning id into zh_asset_id;

    insert into public.site_document_slots (
      slot_key, language, document_asset_id, is_published
    )
    values (
      'post_adoption_guide', 'zh-HK', zh_asset_id, false
    );
  end if;

  -- en branch: same placeholder pattern and is_published = false rationale
  -- as the zh-HK branch above.
  if en_asset_id is null then
    insert into public.document_assets (
      kind, title, language, object_path, byte_size, is_published
    )
    values (
      'adoption_guide',
      'Post-adoption guide (placeholder)',
      'en',
      'placeholder/post-adoption-guide-en.pdf',
      1,
      false
    )
    returning id into en_asset_id;

    insert into public.site_document_slots (
      slot_key, language, document_asset_id, is_published
    )
    values (
      'post_adoption_guide', 'en', en_asset_id, false
    );
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
