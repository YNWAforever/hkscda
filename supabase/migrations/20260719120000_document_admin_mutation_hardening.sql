create or replace function private.enforce_annual_report_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_kind text;
  asset_published boolean;
begin
  select kind, is_published
    into asset_kind, asset_published
  from public.document_assets
  where id = new.document_asset_id
  for update;

  if not found or asset_kind <> 'annual_report' then
    raise exception 'Annual report PDF not found' using errcode = '23514';
  end if;
  if new.is_published and not asset_published then
    raise exception 'Publish the annual report PDF first' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.protect_published_annual_report_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.kind <> 'annual_report' or not new.is_published)
    and exists (
      select 1
      from public.annual_reports
      where document_asset_id = new.id
        and is_published = true
    )
  then
    raise exception 'Unpublish the annual report before changing its PDF asset'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_annual_report_asset on public.annual_reports;
create constraint trigger enforce_annual_report_asset
after insert or update on public.annual_reports
deferrable initially immediate
for each row execute function private.enforce_annual_report_asset();

drop trigger if exists protect_published_annual_report_asset on public.document_assets;
create constraint trigger protect_published_annual_report_asset
after update on public.document_assets
deferrable initially immediate
for each row execute function private.protect_published_annual_report_asset();

create or replace function public.mutate_document_asset_with_audit(
  p_actor_user_id uuid,
  p_operation text,
  p_id uuid,
  p_values jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
  result_published boolean;
begin
  if p_operation = 'create' then
    insert into public.document_assets (
      kind, title, language, bucket_name, object_path, mime_type, byte_size,
      checksum_sha256, is_published, sort_order
    ) values (
      p_values->>'kind',
      p_values->>'title',
      p_values->>'language',
      coalesce(p_values->>'bucket_name', 'site-documents'),
      p_values->>'object_path',
      coalesce(p_values->>'mime_type', 'application/pdf'),
      (p_values->>'byte_size')::bigint,
      p_values->>'checksum_sha256',
      coalesce((p_values->>'is_published')::boolean, false),
      coalesce((p_values->>'sort_order')::integer, 0)
    ) returning id, is_published into result_id, result_published;
  elsif p_operation = 'update' then
    perform 1
    from public.annual_reports
    where document_asset_id = p_id and is_published = true
    for update;

    update public.document_assets set
      kind = case when p_values ? 'kind' then p_values->>'kind' else kind end,
      title = case when p_values ? 'title' then p_values->>'title' else title end,
      language = case when p_values ? 'language' then p_values->>'language' else language end,
      bucket_name = case when p_values ? 'bucket_name' then p_values->>'bucket_name' else bucket_name end,
      object_path = case when p_values ? 'object_path' then p_values->>'object_path' else object_path end,
      mime_type = case when p_values ? 'mime_type' then p_values->>'mime_type' else mime_type end,
      byte_size = case when p_values ? 'byte_size' then (p_values->>'byte_size')::bigint else byte_size end,
      checksum_sha256 = case when p_values ? 'checksum_sha256' then p_values->>'checksum_sha256' else checksum_sha256 end,
      sort_order = case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end
    where id = p_id
    returning id, is_published into result_id, result_published;
  elsif p_operation in ('publish', 'unpublish') then
    if p_operation = 'unpublish' then
      perform 1
      from public.annual_reports
      where document_asset_id = p_id and is_published = true
      for update;
    end if;
    update public.document_assets
    set is_published = (p_operation = 'publish')
    where id = p_id
    returning id, is_published into result_id, result_published;
  elsif p_operation = 'delete' then
    delete from public.document_assets where id = p_id returning id into result_id;
  else
    raise exception 'Unsupported document asset operation' using errcode = '22023';
  end if;

  if result_id is null then
    raise exception 'Document asset not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'document.' || p_operation,
    'document_asset',
    result_id::text,
    coalesce(p_values, '{}'::jsonb)
  );

  if p_operation = 'create' and result_published then
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor_user_id, 'document.publish', 'document_asset', result_id::text, '{}'::jsonb);
  end if;

  return result_id;
end;
$$;

create or replace function public.mutate_annual_report_with_audit(
  p_actor_user_id uuid,
  p_operation text,
  p_id uuid,
  p_values jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
  result_published boolean;
  asset_id uuid;
begin
  if p_operation = 'create' then
    asset_id := (p_values->>'document_asset_id')::uuid;
    perform 1 from public.document_assets where id = asset_id for update;
    insert into public.annual_reports (
      title, year_label, document_asset_id, is_published, sort_order
    ) values (
      p_values->>'title',
      p_values->>'year_label',
      asset_id,
      coalesce((p_values->>'is_published')::boolean, false),
      coalesce((p_values->>'sort_order')::integer, 0)
    ) returning id, is_published into result_id, result_published;
  elsif p_operation = 'update' then
    select coalesce((p_values->>'document_asset_id')::uuid, document_asset_id)
      into asset_id
    from public.annual_reports
    where id = p_id
    for update;
    if asset_id is not null then
      perform 1 from public.document_assets where id = asset_id for update;
    end if;
    update public.annual_reports set
      title = case when p_values ? 'title' then p_values->>'title' else title end,
      year_label = case when p_values ? 'year_label' then p_values->>'year_label' else year_label end,
      document_asset_id = case when p_values ? 'document_asset_id' then (p_values->>'document_asset_id')::uuid else document_asset_id end,
      sort_order = case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end
    where id = p_id
    returning id, is_published into result_id, result_published;
  elsif p_operation in ('publish', 'unpublish') then
    select document_asset_id into asset_id
    from public.annual_reports
    where id = p_id
    for update;
    if asset_id is not null then
      perform 1 from public.document_assets where id = asset_id for update;
    end if;
    update public.annual_reports
    set is_published = (p_operation = 'publish')
    where id = p_id
    returning id, is_published into result_id, result_published;
  elsif p_operation = 'delete' then
    delete from public.annual_reports where id = p_id returning id into result_id;
  else
    raise exception 'Unsupported annual report operation' using errcode = '22023';
  end if;

  if result_id is null then
    raise exception 'Annual report not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'annual_report.' || p_operation,
    'annual_report',
    result_id::text,
    coalesce(p_values, '{}'::jsonb)
  );

  if p_operation = 'create' and result_published then
    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (p_actor_user_id, 'annual_report.publish', 'annual_report', result_id::text, '{}'::jsonb);
  end if;

  return result_id;
end;
$$;

revoke all on function public.mutate_document_asset_with_audit(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.mutate_annual_report_with_audit(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_document_asset_with_audit(uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.mutate_annual_report_with_audit(uuid, text, uuid, jsonb)
  to service_role;
