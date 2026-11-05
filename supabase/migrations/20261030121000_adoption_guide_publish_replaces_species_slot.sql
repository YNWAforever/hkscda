-- BUG-53: publishing a guide under a new topic replaced the live one but left it "published".
--
-- The public slot is per species (post_adoption_guide_<species>), but
-- publish_adoption_guide_release (20260731120000, not redefined since) looked up the release
-- it replaces by (topic, species). Publishing cat guide B with another topic than live cat
-- guide A switched the slot and the Knowledge post to B, while A stayed 'published' with no
-- way to archive it.
--
-- This redefinition is the 20260731120000 function with three changes:
--   * a transaction-scoped advisory lock on the target slot, so two publishes for the same
--     species run one after the other and the second sees the first's release;
--   * the previous release is the latest published release of the same species (the slot),
--     whatever its topic;
--   * every published release of that species other than the one being published is
--     archived, each locked and with its own adoption_guide_release.archive audit row, the
--     same update and audit row the function already wrote for its predecessor. Normally
--     that is just the previous release; it also retires a stale duplicate this bug left.
-- Everything else (signature, security invoker, search_path, idempotency, slot and Knowledge
-- post handling, audit rows, grants) is unchanged.
--
-- No unique index on (species) where state = 'published' is added: the bug itself can have
-- left two published releases for one species in existing data, so creating the index could
-- fail the migration, and archiving those rows here would need an actor the migration does
-- not have. The next publish for that species archives them with a real actor and audit row.
-- The existing (topic, species) index stays.

create or replace function public.publish_adoption_guide_release(
  p_release_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  release_to_publish public.adoption_guide_releases%rowtype;
  previous_release public.adoption_guide_releases%rowtype;
  replaced_release public.adoption_guide_releases%rowtype;
  cached_request public.adoption_guide_publish_requests%rowtype;
  old_zh_hk_asset_id uuid;
  old_en_asset_id uuid;
  legacy_zh_hk_asset_id uuid;
  legacy_en_asset_id uuid;
  paired_knowledge_post_id uuid;
  target_slot_key text;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role = 'admin';

  if not found then
    raise exception 'Active admin actor required' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
  then
    raise exception 'Invalid publish idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into cached_request
  from public.adoption_guide_publish_requests
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if cached_request.release_id <> p_release_id
      or cached_request.release_version <> p_expected_version
    then
      raise exception 'Publish idempotency key was already used for another release version'
        using errcode = '23505';
    end if;
    return cached_request.result;
  end if;

  select * into release_to_publish
  from public.adoption_guide_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Adoption guide release not found' using errcode = 'P0002';
  end if;
  if release_to_publish.version <> p_expected_version then
    raise exception 'Stale adoption guide release version' using errcode = '40001';
  end if;
  if release_to_publish.state <> 'in_review' then
    raise exception 'Only in-review adoption guide releases can be published' using errcode = '23514';
  end if;
  if nullif(btrim(release_to_publish.knowledge_title), '') is null
    or nullif(btrim(release_to_publish.knowledge_topic), '') is null
    or nullif(btrim(release_to_publish.knowledge_short_intro), '') is null
  then
    raise exception 'Adoption guide knowledge metadata is incomplete' using errcode = '23514';
  end if;

  target_slot_key := case release_to_publish.species
    when 'cat' then 'post_adoption_guide_cat'
    when 'dog' then 'post_adoption_guide_dog'
    when 'general' then 'post_adoption_guide_general'
    else null
  end;

  if target_slot_key is null then
    raise exception 'Unsupported adoption guide species' using errcode = '23514';
  end if;

  -- BUG-53: one publish per slot at a time, so the lookup below sees a concurrent publish
  -- of the same species once it commits.
  perform pg_advisory_xact_lock(
    hashtextextended('adoption_guide_release_slot:' || target_slot_key, 0)
  );

  -- BUG-53: the slot is per species, so the release it replaces is the species' published
  -- release, whatever its topic.
  select * into previous_release
  from public.adoption_guide_releases
  where species = release_to_publish.species
    and state = 'published'
    and id <> release_to_publish.id
  order by published_at desc nulls last, id desc
  limit 1
  for update;

  select document_asset_id into old_zh_hk_asset_id
  from public.site_document_slots slots
  where slots.slot_key = target_slot_key
    and language = 'zh-HK'
  for update;

  select document_asset_id into old_en_asset_id
  from public.site_document_slots slots
  where slots.slot_key = target_slot_key
    and language = 'en'
  for update;

  if previous_release.id is null then
    select document_asset_id into legacy_zh_hk_asset_id
    from public.site_document_slots slots
    where slots.slot_key = 'post_adoption_guide'
      and language = 'zh-HK'
    for update;

    select document_asset_id into legacy_en_asset_id
    from public.site_document_slots slots
    where slots.slot_key = 'post_adoption_guide'
      and language = 'en'
    for update;
  end if;

  perform private.assert_adoption_guide_release_assets(
    release_to_publish.zh_hk_asset_id,
    release_to_publish.en_asset_id
  );

  update public.document_assets
  set is_published = true,
      updated_at = now()
  where id in (release_to_publish.zh_hk_asset_id, release_to_publish.en_asset_id);

  if release_to_publish.knowledge_post_id is null then
    insert into public.knowledge_posts (
      title,
      topic,
      short_intro,
      external_url,
      document_asset_id,
      zh_hk_document_asset_id,
      en_document_asset_id,
      source_name,
      is_published,
      sort_order
    ) values (
      release_to_publish.knowledge_title,
      release_to_publish.knowledge_topic,
      release_to_publish.knowledge_short_intro,
      null,
      null,
      release_to_publish.zh_hk_asset_id,
      release_to_publish.en_asset_id,
      release_to_publish.knowledge_source_name,
      true,
      release_to_publish.sort_order
    )
    returning id into paired_knowledge_post_id;
  else
    perform 1
    from public.knowledge_posts
    where id = release_to_publish.knowledge_post_id
    for update;

    update public.knowledge_posts set
      title = release_to_publish.knowledge_title,
      topic = release_to_publish.knowledge_topic,
      short_intro = release_to_publish.knowledge_short_intro,
      external_url = null,
      document_asset_id = null,
      zh_hk_document_asset_id = release_to_publish.zh_hk_asset_id,
      en_document_asset_id = release_to_publish.en_asset_id,
      source_name = release_to_publish.knowledge_source_name,
      is_published = true,
      sort_order = release_to_publish.sort_order,
      updated_at = now()
    where id = release_to_publish.knowledge_post_id
    returning id into paired_knowledge_post_id;

    if paired_knowledge_post_id is null then
      raise exception 'Adoption guide Knowledge post not found' using errcode = 'P0002';
    end if;
  end if;

  update public.knowledge_posts
  set is_published = false,
      updated_at = now()
  where id <> paired_knowledge_post_id
    and (
      document_asset_id in (
        old_zh_hk_asset_id,
        old_en_asset_id,
        legacy_zh_hk_asset_id,
        legacy_en_asset_id
      )
      or zh_hk_document_asset_id in (old_zh_hk_asset_id, old_en_asset_id)
      or en_document_asset_id in (old_zh_hk_asset_id, old_en_asset_id)
      or id = previous_release.knowledge_post_id
    );

  insert into public.site_document_slots (
    slot_key,
    language,
    document_asset_id,
    is_published
  ) values
    (target_slot_key, 'zh-HK', release_to_publish.zh_hk_asset_id, true),
    (target_slot_key, 'en', release_to_publish.en_asset_id, true)
  on conflict (slot_key, language) do update set
    document_asset_id = excluded.document_asset_id,
    is_published = true,
    updated_at = now();

  -- BUG-53: archive every published release of the species (normally just previous_release),
  -- each the way the predecessor was always archived.
  for replaced_release in
    select *
    from public.adoption_guide_releases
    where species = release_to_publish.species
      and state = 'published'
      and id <> release_to_publish.id
    order by published_at desc nulls last, id desc
    for update
  loop
    update public.adoption_guide_releases set
      state = 'archived',
      archived_by = actor.id,
      archived_at = now(),
      updated_by = actor.id,
      version = version + 1
    where id = replaced_release.id;

    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor_user_id,
      'adoption_guide_release.archive',
      'adoption_guide_release',
      replaced_release.id::text,
      jsonb_build_object('replaced_by_release_id', release_to_publish.id)
    );
  end loop;

  update public.adoption_guide_releases set
    knowledge_post_id = paired_knowledge_post_id,
    state = 'published',
    published_by = actor.id,
    published_at = now(),
    archived_by = null,
    archived_at = null,
    updated_by = actor.id,
    version = version + 1
  where id = release_to_publish.id
  returning * into release_to_publish;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values
    (
      p_actor_user_id,
      'document.publish',
      'document_asset',
      release_to_publish.zh_hk_asset_id::text,
      jsonb_build_object('release_id', release_to_publish.id, 'language', 'zh-HK')
    ),
    (
      p_actor_user_id,
      'document.publish',
      'document_asset',
      release_to_publish.en_asset_id::text,
      jsonb_build_object('release_id', release_to_publish.id, 'language', 'en')
    ),
    (
      p_actor_user_id,
      'site_document_slot.upsert',
      'site_document_slot',
      target_slot_key || ':zh-HK',
      jsonb_build_object(
        'release_id', release_to_publish.id,
        'document_asset_id', release_to_publish.zh_hk_asset_id,
        'language', 'zh-HK'
      )
    ),
    (
      p_actor_user_id,
      'site_document_slot.upsert',
      'site_document_slot',
      target_slot_key || ':en',
      jsonb_build_object(
        'release_id', release_to_publish.id,
        'document_asset_id', release_to_publish.en_asset_id,
        'language', 'en'
      )
    ),
    (
      p_actor_user_id,
      'knowledge_post.publish',
      'knowledge_post',
      paired_knowledge_post_id::text,
      jsonb_build_object('release_id', release_to_publish.id)
    ),
    (
      p_actor_user_id,
      'adoption_guide_release.publish',
      'adoption_guide_release',
      release_to_publish.id::text,
      jsonb_build_object(
        'previous_release_id', previous_release.id,
        'slot_key', target_slot_key,
        'version', release_to_publish.version
      )
    );

  result := jsonb_build_object(
    'release_id', release_to_publish.id,
    'release_version', release_to_publish.version,
    'knowledge_post_id', paired_knowledge_post_id,
    'zh_hk_asset_id', release_to_publish.zh_hk_asset_id,
    'en_asset_id', release_to_publish.en_asset_id,
    'slot_key', target_slot_key
  );

  insert into public.adoption_guide_publish_requests (
    idempotency_key,
    release_id,
    release_version,
    result
  ) values (
    p_idempotency_key,
    release_to_publish.id,
    p_expected_version,
    result
  );

  return result;
end;
$$;

-- Unchanged from 20260731120000: service_role only.
revoke all on function public.publish_adoption_guide_release(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_adoption_guide_release(uuid, integer, uuid, text)
  to service_role;
