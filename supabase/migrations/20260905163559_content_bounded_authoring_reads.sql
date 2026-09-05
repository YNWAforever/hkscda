-- Staff reads run only through the authenticated server boundary.
create or replace function public.read_content_admin_summaries(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with filtered as (
 select item.* from public.content_item item
 where (p_filters->>'type' is null or item.type=p_filters->>'type')
 and (p_filters->>'status' is null or item.status=p_filters->>'status')
 and (p_filters->>'q' is null or strpos(lower(item.title||' '||coalesce(item.summary,'')),lower(p_filters->>'q'))>0)
 and ((p_filters->>'animalType' is null and p_filters->>'publicStatus' is null and p_filters->>'rescueRegion' is null) or exists(select 1 from public.rescue_story_profile profile where profile.content_item_id=item.id
 and (p_filters->>'animalType' is null or profile.animal_type=p_filters->>'animalType')
 and (p_filters->>'publicStatus' is null or profile.public_status=p_filters->>'publicStatus')
 and (p_filters->>'rescueRegion' is null or profile.rescue_region=p_filters->>'rescueRegion')))
 ), page as (
 select item.* from filtered item order by item.updated_at desc,item.id
 limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 offset (greatest(1,coalesce((p_filters->>'page')::int,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 ), snapshots as (
 select item.id,item.updated_at,jsonb_build_object(
 'content',to_jsonb(item)-'body'-'seo_title'-'seo_description'-'og_title'-'og_description',
 'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=item.id),
 'updates',case when latest.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(latest)-'body') end,
 'media',case when cover.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(cover)) end
 ) as snapshot
 from page item
 left join lateral (select u.* from public.story_update u where u.content_item_id=item.id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1) latest on true
 left join lateral (select m.* from public.content_media m where m.content_item_id=item.id
 and (m.story_update_id is null or exists(select 1 from public.story_update u where u.id=m.story_update_id and u.content_item_id=item.id and u.is_authoring_active and u.visibility='public'))
 and (m.id=item.cover_media_id or m.is_cover)
 order by (m.id=item.cover_media_id) desc nulls last,m.sort_order,m.created_at,m.id limit 1) cover on true
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(snapshot order by updated_at desc,id) from snapshots),'[]'::jsonb))
$$;

create or replace function public.read_content_authoring_detail(p_content_id uuid,p_history_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare item public.content_item%rowtype;page_offset integer;links jsonb;media jsonb;updates jsonb;copies jsonb;drafts jsonb;
begin
 if p_history_page is null or p_history_page<1 or p_history_page>100000 then raise exception 'Invalid history page' using errcode='22023';end if;
 select * into item from public.content_item where id=p_content_id;
 if not found then return null;end if;
 page_offset:=(p_history_page-1)*20;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into links from (select * from public.content_link where content_item_id=p_content_id order by created_at,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into media from (select * from public.content_media where content_item_id=p_content_id order by sort_order,created_at,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)-'body'),'[]'::jsonb) into updates from (select * from public.story_update where content_item_id=p_content_id and is_authoring_active order by occurred_at desc,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into copies from (select * from public.social_copy_variant where content_item_id=p_content_id order by created_at desc,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into drafts from (select * from public.recipient_notification_draft where content_item_id=p_content_id order by created_at desc,id limit 21 offset page_offset) row;
 return jsonb_build_object('content',to_jsonb(item),'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=p_content_id),'cover',(select to_jsonb(m) from public.content_media m where m.id=item.cover_media_id and m.content_item_id=p_content_id),'latest',(select to_jsonb(u)-'body' from public.story_update u where u.content_item_id=p_content_id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1),'links',links,'media',media,'updates',updates,'socialCopies',copies,'notificationDrafts',drafts);
end $$;
revoke all on function public.read_content_admin_summaries(jsonb) from public,anon,authenticated;
revoke all on function public.read_content_authoring_detail(uuid,integer) from public,anon,authenticated;
grant execute on function public.read_content_admin_summaries(jsonb) to service_role;
grant execute on function public.read_content_authoring_detail(uuid,integer) to service_role;
