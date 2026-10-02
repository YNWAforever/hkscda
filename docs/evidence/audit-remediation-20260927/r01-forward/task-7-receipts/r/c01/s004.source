-- Keep each admin content change and its audit rows in one PostgreSQL transaction.
create or replace function public.mutate_admin_content_with_audit(
  p_actor_user_id uuid,
  p_entity text,
  p_operation text,
  p_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  result jsonb;
  action_name text;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

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
        updated_by = actor.id
      where id = p_id
      returning to_jsonb(board_member.*) into result;
      action_name := 'board_member.update';
    end if;
    if result is null then
      raise exception 'Board member not found' using errcode = 'P0002';
    end if;

  elsif p_entity = 'board_member' and p_operation = 'deactivate' then
    update public.board_member set is_active = false, updated_by = actor.id
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
        sort_order = (p_payload->>'sort_order')::integer
      where id = p_id
      returning to_jsonb(knowledge_posts.*) into result;
      action_name := 'knowledge_post.update';
    end if;
    if result is null then
      raise exception 'Knowledge post not found' using errcode = 'P0002';
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
            case when p_operation = 'upsert' then p_payload else '{}'::jsonb end);
  end if;

  return result;
end;
$$;

revoke all on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb)
  to service_role;
