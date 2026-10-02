-- Read-only staff queue for the current CMS quality metadata. No publication mutation.
create function public.editorial_quality_queue(
  p_actor uuid,
  p_page integer,
  p_quality text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.admin_user a
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = p_actor
      and a.status = 'active'
      and a.role in ('staff', 'admin')
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_page is null or p_page not between 1 and 10000
     or p_quality is null or p_quality not in ('demo', 'expired', 'missing_source') then
    raise exception 'invalid queue filter' using errcode = '22023';
  end if;

  with candidates as (
    select
      'content'::text as entity_kind,
      c.id as entity_id,
      c.title,
      c.status as publication_state,
      c.draft_revision_id::text as revision_key,
      c.updated_at,
      c.effective_until,
      coalesce(r.classification, 'needs_review') as classification,
      r.evidence,
      p_quality as quality_reason
    from public.content_item c
    left join public.editorial_content_review r
      on r.entity_kind = 'content'
      and r.entity_id = c.id
      and r.revision_key = c.draft_revision_id::text
    where c.status <> 'archived'
      and (
        (p_quality = 'demo' and (c.content_class = 'demo' or r.classification = 'demo'))
        or (p_quality = 'expired' and c.effective_until < now())
        or (p_quality = 'missing_source' and nullif(btrim(c.source_reference), '') is null)
      )
  ), paged as (
    select *
    from candidates
    order by updated_at desc, entity_id desc
    offset (p_page - 1) * 25
    limit 25
  )
  select jsonb_build_object(
    'total', (select count(*) from candidates),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.updated_at desc, p.entity_id desc) from paged p),
      '[]'::jsonb
    )
  ) into result;
  return result;
end
$$;

revoke all on function public.editorial_quality_queue(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.editorial_quality_queue(uuid,integer,text) to service_role;

create index if not exists content_item_quality_class_idx
  on public.content_item(content_class, updated_at desc, id desc)
  where status <> 'archived';
create index if not exists content_item_quality_expiry_idx
  on public.content_item(effective_until, updated_at desc, id desc)
  where status <> 'archived' and effective_until is not null;
