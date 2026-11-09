-- Revision fences for the about, FAQ, governance and knowledge admin editors (2026-11-09 audit,
-- "Not filed as bugs": those four editors used last-write-wins, so two tabs saving the same row
-- silently kept the later write). Each row now carries a monotonically increasing `revision`; the
-- update RPCs refuse a write whose caller sends a stale `expectedRevision` with errcode 40001 (the
-- "Stale content version" convention the content CMS already uses) and bump `revision` on every
-- change. Existing rows start at 0, and a caller that sends no expected revision (the previously
-- deployed app) keeps the old last-write-wins behaviour, so the migration is backward compatible.
-- The increment lives in the RPCs rather than a trigger because these four tables have no other
-- write path: admin browser code goes through the API (`adminBrowserDataGuard.test.ts`) and the
-- RPCs are service-role-only.
--
-- Latest definitions win: the function bodies below are the 20261010130400 body of
-- `mutate_admin_content_with_audit` (board_member, knowledge_post), the 20261010130300 body of
-- `deactivate_faq_entry_with_audit`, the 20260830120000 body of `upsert_faq_entry_with_audit` and
-- the 20260830140000 body of `upsert_about_page_content_with_audit`, each with only the revision
-- fence/increment added. Their identity checks, audit rows, publish guards, search_path pins and
-- grants are unchanged.

alter table public.faq_entry add column if not exists revision integer not null default 0;
alter table public.board_member add column if not exists revision integer not null default 0;
alter table public.knowledge_posts add column if not exists revision integer not null default 0;
alter table public.about_page_content add column if not exists revision integer not null default 0;

-- The generic admin content mutation gains an optional expected revision. It is passed as a
-- parameter rather than a payload key so `p_payload` (stored whole in the audit detail) and every
-- existing caller stay unchanged. The parameter list changes, so the old signature is dropped.
drop function if exists public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb);

create or replace function public.mutate_admin_content_with_audit(p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb, p_expected_revision bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor public.admin_user%rowtype;
  result jsonb;
  action_name text;
  referenced_asset_id uuid;
begin
  perform 1 from auth.users u
  where u.id = p_actor_user_id and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin')
  for share;

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  if p_entity = 'adoption_fee' and p_operation = 'upsert' then
    if p_id is null then
      insert into public.adoption_fees (animal_type, item_name, price_hkd, sort_order, is_published)
      values (
        p_payload->>'animal_type', p_payload->>'item_name',
        p_payload->>'price_hkd', (p_payload->>'sort_order')::integer,
        (p_payload->>'is_published')::boolean
      )
      returning to_jsonb(adoption_fees.*) into result;
      action_name := 'adoption_fee.create';
    else
      update public.adoption_fees set
        animal_type = p_payload->>'animal_type',
        item_name = p_payload->>'item_name',
        price_hkd = p_payload->>'price_hkd',
        sort_order = (p_payload->>'sort_order')::integer,
        is_published = (p_payload->>'is_published')::boolean
      where id = p_id
      returning to_jsonb(adoption_fees.*) into result;
      action_name := 'adoption_fee.update';
    end if;
    if result is null then
      raise exception 'Adoption fee not found' using errcode = 'P0002';
    end if;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values
      (p_actor_user_id, action_name, p_entity, result->>'id', p_payload),
      (p_actor_user_id,
       case when (p_payload->>'is_published')::boolean then 'adoption_fee.publish' else 'adoption_fee.unpublish' end,
       p_entity, result->>'id', '{}'::jsonb);

  elsif p_entity = 'dog_friendly_estate' and p_operation = 'upsert' then
    if p_id is null then
      insert into public.dog_friendly_estates (estate_name, district, notes, sort_order, is_published)
      values (
        p_payload->>'estate_name', p_payload->>'district',
        p_payload->>'notes', (p_payload->>'sort_order')::integer,
        (p_payload->>'is_published')::boolean
      )
      returning to_jsonb(dog_friendly_estates.*) into result;
      action_name := 'dog_friendly_estate.create';
    else
      update public.dog_friendly_estates set
        estate_name = p_payload->>'estate_name',
        district = p_payload->>'district',
        notes = p_payload->>'notes',
        sort_order = (p_payload->>'sort_order')::integer,
        is_published = (p_payload->>'is_published')::boolean
      where id = p_id
      returning to_jsonb(dog_friendly_estates.*) into result;
      action_name := 'dog_friendly_estate.update';
    end if;
    if result is null then
      raise exception 'Dog-friendly estate not found' using errcode = 'P0002';
    end if;
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values
      (p_actor_user_id, action_name, p_entity, result->>'id', p_payload),
      (p_actor_user_id,
       case when (p_payload->>'is_published')::boolean then 'dog_friendly_estate.publish' else 'dog_friendly_estate.unpublish' end,
       p_entity, result->>'id', '{}'::jsonb);

  elsif p_entity = 'dog_friendly_estate' and p_operation = 'delete' then
    delete from public.dog_friendly_estates where id = p_id
    returning to_jsonb(dog_friendly_estates.*) into result;
    if result is null then
      raise exception 'Dog-friendly estate not found' using errcode = 'P0002';
    end if;
    action_name := 'dog_friendly_estate.delete';

  elsif p_entity = 'board_member' and p_operation = 'upsert' then
    if p_id is null then
      insert into public.board_member (
        name, role_title, sort_order, effective_date, created_by, updated_by
      ) values (
        p_payload->>'name', p_payload->>'role_title',
        (p_payload->>'sort_order')::integer, (p_payload->>'effective_date')::date,
        actor.id, actor.id
      )
      returning to_jsonb(board_member.*) into result;
      action_name := 'board_member.create';
    else
      update public.board_member set
        name = p_payload->>'name',
        role_title = p_payload->>'role_title',
        sort_order = (p_payload->>'sort_order')::integer,
        effective_date = (p_payload->>'effective_date')::date,
        updated_by = actor.id,
        revision = revision + 1
      where id = p_id
        and (p_expected_revision is null or revision = p_expected_revision)
      returning to_jsonb(board_member.*) into result;
      action_name := 'board_member.update';
    end if;
    if result is null then
      if p_id is not null and p_expected_revision is not null
         and exists (select 1 from public.board_member where id = p_id) then
        raise exception 'Board member changed since it was loaded' using errcode = '40001';
      end if;
      raise exception 'Board member not found' using errcode = 'P0002';
    end if;

  elsif p_entity = 'board_member' and p_operation = 'deactivate' then
    update public.board_member set is_active = false, updated_by = actor.id, revision = revision + 1
    where id = p_id
    returning to_jsonb(board_member.*) into result;
    if result is null then
      raise exception 'Board member not found' using errcode = 'P0002';
    end if;
    action_name := 'board_member.deactivate';

  elsif p_entity = 'knowledge_post' and p_operation = 'upsert' then
    if p_id is null then
      insert into public.knowledge_posts (
        title, topic, short_intro, source_name, external_url,
        document_asset_id, zh_hk_document_asset_id, en_document_asset_id,
        is_published, sort_order
      ) values (
        p_payload->>'title', p_payload->>'topic', p_payload->>'short_intro',
        p_payload->>'source_name', p_payload->>'external_url',
        (p_payload->>'document_asset_id')::uuid,
        (p_payload->>'zh_hk_document_asset_id')::uuid,
        (p_payload->>'en_document_asset_id')::uuid,
        (p_payload->>'is_published')::boolean, (p_payload->>'sort_order')::integer
      )
      returning to_jsonb(knowledge_posts.*) into result;
      action_name := 'knowledge_post.create';
    else
      update public.knowledge_posts set
        title = p_payload->>'title',
        topic = p_payload->>'topic',
        short_intro = p_payload->>'short_intro',
        source_name = p_payload->>'source_name',
        external_url = p_payload->>'external_url',
        document_asset_id = (p_payload->>'document_asset_id')::uuid,
        zh_hk_document_asset_id = (p_payload->>'zh_hk_document_asset_id')::uuid,
        en_document_asset_id = (p_payload->>'en_document_asset_id')::uuid,
        is_published = (p_payload->>'is_published')::boolean,
        sort_order = (p_payload->>'sort_order')::integer,
        revision = revision + 1
      where id = p_id
        and (p_expected_revision is null or revision = p_expected_revision)
      returning to_jsonb(knowledge_posts.*) into result;
      action_name := 'knowledge_post.update';
    end if;
    if result is null then
      if p_id is not null and p_expected_revision is not null
         and exists (select 1 from public.knowledge_posts where id = p_id) then
        raise exception 'Knowledge post changed since it was loaded' using errcode = '40001';
      end if;
      raise exception 'Knowledge post not found' using errcode = 'P0002';
    end if;
    if (result->>'is_published')::boolean then
      for referenced_asset_id in
        select distinct refs.asset_id
        from unnest(array[
          (result->>'document_asset_id')::uuid,
          (result->>'zh_hk_document_asset_id')::uuid,
          (result->>'en_document_asset_id')::uuid
        ]) as refs(asset_id)
        where refs.asset_id is not null
        order by refs.asset_id
      loop
        perform 1
        from public.document_assets
        where id = referenced_asset_id and is_published = true
        for update;
        if not found then
          raise exception 'Publish the PDF asset before publishing its knowledge post'
            using errcode = '23514';
        end if;
      end loop;
    end if;

  elsif p_entity = 'knowledge_post' and p_operation = 'delete' then
    delete from public.knowledge_posts where id = p_id
    returning to_jsonb(knowledge_posts.*) into result;
    if result is null then
      raise exception 'Knowledge post not found' using errcode = 'P0002';
    end if;
    action_name := 'knowledge_post.delete';

  else
    raise exception 'Unsupported admin content mutation' using errcode = '22023';
  end if;

  if p_entity not in ('adoption_fee', 'dog_friendly_estate')
     or p_operation = 'delete' then
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor_user_id, action_name, p_entity, result->>'id',
            case when p_operation = 'upsert' then p_payload
                 else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                   'reason', nullif(pg_catalog.btrim(p_payload->>'reason'), '')))
            end);
  end if;

  return result;
end;
$function$;

revoke all on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb, bigint)
  to service_role;

-- FAQ upsert gains the same optional expected revision. A stale one is refused for an update;
-- creating a new entry ignores it (there is no row to conflict with).
drop function if exists public.upsert_faq_entry_with_audit(
  uuid, uuid, text, text, text, text, text, text[], text[], text, boolean, integer, boolean
);

create or replace function public.upsert_faq_entry_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_category text,
  p_question_zh text,
  p_question_en text,
  p_answer_zh text,
  p_answer_en text,
  p_keywords_zh text[],
  p_keywords_en text[],
  p_cta_key text,
  p_sensitive boolean,
  p_sort_order integer,
  p_is_active boolean,
  p_expected_revision bigint default null
)
returns public.faq_entry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  result public.faq_entry;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.faq_entry (
      category, question_zh, question_en, answer_zh, answer_en,
      keywords_zh, keywords_en, cta_key, sensitive, sort_order, is_active,
      created_by, updated_by
    ) values (
      p_category, p_question_zh, p_question_en, p_answer_zh, p_answer_en,
      p_keywords_zh, p_keywords_en, p_cta_key, p_sensitive, p_sort_order, p_is_active,
      actor.id, actor.id
    )
    returning * into result;
  else
    update public.faq_entry set
      category = p_category,
      question_zh = p_question_zh,
      question_en = p_question_en,
      answer_zh = p_answer_zh,
      answer_en = p_answer_en,
      keywords_zh = p_keywords_zh,
      keywords_en = p_keywords_en,
      cta_key = p_cta_key,
      sensitive = p_sensitive,
      sort_order = p_sort_order,
      is_active = p_is_active,
      updated_by = actor.id,
      revision = revision + 1
    where id = p_id
      and (p_expected_revision is null or revision = p_expected_revision)
    returning * into result;

    if not found then
      if p_expected_revision is not null
         and exists (select 1 from public.faq_entry where id = p_id) then
        raise exception 'FAQ entry changed since it was loaded' using errcode = '40001';
      end if;
      raise exception 'FAQ entry not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when p_id is null then 'faq_entry.create' else 'faq_entry.update' end,
    'faq_entry',
    result.id::text,
    jsonb_build_object('category', p_category, 'sensitive', p_sensitive)
  );

  return result;
end;
$$;

revoke all on function public.upsert_faq_entry_with_audit(
  uuid, uuid, text, text, text, text, text, text[], text[], text, boolean, integer, boolean, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.upsert_faq_entry_with_audit(
  uuid, uuid, text, text, text, text, text, text[], text[], text, boolean, integer, boolean, bigint
) to service_role;

-- Hiding an entry is an edit too: it moves the revision forward so an editor with the old revision
-- gets the conflict notice instead of silently reverting the hide on its next save.
create or replace function public.deactivate_faq_entry_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  update public.faq_entry set is_active = false, revision = revision + 1 where id = p_id;

  if not found then
    raise exception 'FAQ entry not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, 'faq_entry.deactivate', 'faq_entry', p_id::text, jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(p_reason), ''))));
end;
$$;

revoke all on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) to service_role;

-- About page content is keyed by page_slug, so the fence is a compare-and-set on the existing row.
drop function if exists public.upsert_about_page_content_with_audit(uuid, text, jsonb);

create or replace function public.upsert_about_page_content_with_audit(
  p_actor_user_id uuid,
  p_page_slug text,
  p_content jsonb,
  p_expected_revision bigint default null
)
returns public.about_page_content
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  existing public.about_page_content%rowtype;
  result public.about_page_content;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  -- Not redundant with the table's check constraint: this gives callers a friendlier,
  -- distinct errcode ('22023') instead of the raw check-violation errcode ('23514').
  if p_page_slug not in ('about', 'tnr', 'cccp') then
    raise exception 'Unknown about page slug' using errcode = '22023';
  end if;

  select * into existing
  from public.about_page_content
  where page_slug = p_page_slug
  for update;

  if found then
    if p_expected_revision is not null and existing.revision is distinct from p_expected_revision then
      raise exception 'About page changed since it was loaded' using errcode = '40001';
    end if;
    update public.about_page_content set
      content = p_content,
      updated_by = actor.id,
      updated_at = now(),
      revision = revision + 1
    where page_slug = p_page_slug
    returning * into result;
  else
    -- The three pages are seeded; asking to update one that no longer exists is not a fence
    -- failure, but a caller that expected a row should not silently create it.
    if p_expected_revision is not null then
      raise exception 'About page content not found' using errcode = 'P0002';
    end if;
    insert into public.about_page_content (page_slug, content, updated_by, updated_at)
    values (p_page_slug, p_content, actor.id, now())
    returning * into result;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'about_page_content.update',
    'about_page_content',
    p_page_slug,
    jsonb_build_object('page_slug', p_page_slug)
  );

  return result;
end;
$$;

revoke all on function public.upsert_about_page_content_with_audit(uuid, text, jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_about_page_content_with_audit(uuid, text, jsonb, bigint)
  to service_role;
