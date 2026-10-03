-- Filter featured stories inside the bounded published-snapshot read.
create or replace function public.read_published_content_snapshots(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with filtered as (
    select private.materialize_published_content_snapshot(revision.public_snapshot,revision.id) as snapshot, item.published_at, item.id
    from public.content_item item join public.content_revision revision
      on revision.id=item.published_revision_id and revision.content_item_id=item.id
    where item.status='published'
      and (p_filters->>'slug' is null or revision.public_snapshot->'content'->>'slug'=p_filters->>'slug')
      and (p_filters->>'type' is null or revision.public_snapshot->'content'->>'type'=p_filters->>'type')
      and (p_filters->>'isFeatured' is null or coalesce((revision.public_snapshot->'profile'->>'is_featured')::boolean,false)=(p_filters->>'isFeatured')::boolean)
      and (p_filters->>'animalType' is null or revision.public_snapshot->'profile'->>'animal_type'=p_filters->>'animalType')
      and (p_filters->>'publicStatus' is null or revision.public_snapshot->'profile'->>'public_status'=p_filters->>'publicStatus')
      and (p_filters->>'rescueRegion' is null or revision.public_snapshot->'profile'->>'rescue_region'=p_filters->>'rescueRegion')
      and (p_filters->>'q' is null or strpos(lower(coalesce(revision.public_snapshot->'content'->>'title','') || ' ' || coalesce(revision.public_snapshot->'content'->>'summary','')),lower(p_filters->>'q'))>0)
  ), page as (
    select * from filtered order by published_at desc nulls last,id
    limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
    offset (greatest(1,coalesce((p_filters->>'page')::integer,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
  )
  select jsonb_build_object('total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('snapshot',case when p_filters->>'detail'='true' then snapshot else private.content_summary_snapshot(snapshot) end,'published_at',published_at) order by published_at desc nulls last,id) from page),'[]'::jsonb))
$$;
revoke all on function public.read_published_content_snapshots(jsonb) from public,anon,authenticated;
grant execute on function public.read_published_content_snapshots(jsonb) to service_role;
