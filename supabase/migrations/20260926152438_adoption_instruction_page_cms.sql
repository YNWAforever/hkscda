create schema if not exists private;

create or replace function private.is_adoption_instruction_plain_text(value text, max_length integer)
returns boolean
language sql
immutable
as $$
  select value is not null
    and char_length(btrim(value)) between 1 and max_length
    and value !~* '(<|>|javascript:|https://|http://|www\.)';
$$;

create or replace function private.has_exact_jsonb_keys(candidate jsonb, expected text[])
returns boolean
language sql
immutable
as $$
  select case when jsonb_typeof(candidate) = 'object' then
    candidate ?& expected and (select count(*) from jsonb_object_keys(candidate)) = cardinality(expected)
    else false end;
$$;

create or replace function private.is_valid_adoption_instruction_content(candidate jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  text_path text[];
  max_length integer;
  field_path text;
begin
  if jsonb_typeof(candidate) is distinct from 'object'
    or not private.has_exact_jsonb_keys(candidate, array['hero', 'fees', 'estates', 'guides', 'rules', 'care'])
    or not private.has_exact_jsonb_keys(candidate->'hero', array['eyebrow', 'title', 'description'])
    or not private.has_exact_jsonb_keys(candidate->'fees', array['sectionTitle', 'dogTitle', 'catTitle', 'itemLabel', 'amountLabel', 'notice'])
    or not private.has_exact_jsonb_keys(candidate->'estates', array['sectionTitle', 'introduction', 'estateLabel', 'districtLabel', 'notesLabel', 'emptyState'])
    or not private.has_exact_jsonb_keys(candidate->'guides', array['sectionTitle', 'catTitle', 'dogTitle', 'generalTitle', 'zhHkActionLabel', 'enActionLabel'])
    or not private.has_exact_jsonb_keys(candidate->'rules', array['title'])
    or not private.has_exact_jsonb_keys(candidate->'care', array['cat', 'dog'])
  then
    return false;
  end if;

  foreach field_path in array array['hero.eyebrow', 'hero.title', 'hero.description', 'fees.sectionTitle', 'fees.dogTitle', 'fees.catTitle', 'fees.itemLabel', 'fees.amountLabel', 'fees.notice', 'estates.sectionTitle', 'estates.introduction', 'estates.estateLabel', 'estates.districtLabel', 'estates.notesLabel', 'estates.emptyState', 'guides.sectionTitle', 'guides.catTitle', 'guides.dogTitle', 'guides.generalTitle', 'guides.zhHkActionLabel', 'guides.enActionLabel', 'rules.title', 'care.cat.title', 'care.dog.title'] loop
    text_path := string_to_array(field_path, '.');
    max_length := case array_to_string(text_path, '.')
      when 'hero.eyebrow' then 120
      when 'hero.title' then 180
      when 'hero.description' then 500
      when 'fees.sectionTitle' then 180
      when 'fees.dogTitle' then 180
      when 'fees.catTitle' then 180
      when 'fees.itemLabel' then 120
      when 'fees.amountLabel' then 120
      when 'fees.notice' then 500
      when 'estates.sectionTitle' then 180
      when 'estates.introduction' then 500
      when 'estates.estateLabel' then 120
      when 'estates.districtLabel' then 120
      when 'estates.notesLabel' then 120
      when 'estates.emptyState' then 500
      when 'guides.sectionTitle' then 180
      when 'guides.catTitle' then 180
      when 'guides.dogTitle' then 180
      when 'guides.generalTitle' then 180
      when 'guides.zhHkActionLabel' then 120
      when 'guides.enActionLabel' then 120
      when 'rules.title' then 180
      when 'care.cat.title' then 180
      when 'care.dog.title' then 180
      else null
    end;
    if max_length is null
      or jsonb_typeof(candidate #> text_path) is distinct from 'string'
      or not private.is_adoption_instruction_plain_text(candidate #>> text_path, max_length)
    then
      return false;
    end if;
  end loop;

  if not private.has_exact_jsonb_keys(candidate->'care'->'cat', array['title']) or not private.has_exact_jsonb_keys(candidate->'care'->'dog', array['title']) then return false; end if;

  return true;
end;
$$;

create table if not exists public.adoption_instruction_pages (
  page_key text primary key check (page_key = 'adoption-instructions'),
  published_revision_id uuid,
  draft_revision_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adoption_instruction_revisions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null references public.adoption_instruction_pages(page_key) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  state text not null check (state in ('draft', 'published', 'archived')),
  content jsonb not null check (private.is_valid_adoption_instruction_content(content)),
  source_revision_id uuid,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.admin_user(id) on delete restrict,
  updated_by uuid references public.admin_user(id) on delete restrict,
  published_by uuid references public.admin_user(id) on delete restrict,
  published_at timestamptz,
  archived_by uuid references public.admin_user(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_key, revision_number)
);

alter table public.adoption_instruction_revisions
  add constraint adoption_instruction_revisions_source_revision_id_fkey
  foreign key (source_revision_id) references public.adoption_instruction_revisions(id) on delete restrict;
alter table public.adoption_instruction_pages
  add constraint adoption_instruction_pages_published_revision_id_fkey
  foreign key (published_revision_id) references public.adoption_instruction_revisions(id) on delete restrict;
alter table public.adoption_instruction_pages
  add constraint adoption_instruction_pages_draft_revision_id_fkey
  foreign key (draft_revision_id) references public.adoption_instruction_revisions(id) on delete restrict;

create unique index if not exists adoption_instruction_one_draft_idx
  on public.adoption_instruction_revisions (page_key) where state = 'draft';
create unique index if not exists adoption_instruction_one_published_idx
  on public.adoption_instruction_revisions (page_key) where state = 'published';

create table if not exists public.adoption_instruction_publish_requests (
  actor_admin_id uuid not null references public.admin_user(id),
  idempotency_key text primary key check (char_length(idempotency_key) between 16 and 200),
  page_key text not null references public.adoption_instruction_pages(page_key) on delete restrict,
  revision_id uuid not null references public.adoption_instruction_revisions(id) on delete restrict,
  revision_version integer not null check (revision_version > 0),
  result jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.adoption_instruction_pages (page_key)
values ('adoption-instructions')
on conflict (page_key) do nothing;

with seeded_revision as (
  insert into public.adoption_instruction_revisions (
    page_key, revision_number, state, content, version, published_at
  ) values (
    'adoption-instructions',
    1,
    'published',
    $adoption_instruction_content$
{"hero": {"eyebrow": "領養準備", "title": "領養需知", "description": "了解申請、家訪和日常照護，為你和動物做好長期準備。"}, "fees": {"sectionTitle": "領養費用", "dogTitle": "狗隻領養費用", "catTitle": "貓隻領養費用", "itemLabel": "項目", "amountLabel": "費用（HK$）", "notice": "以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。"}, "estates": {"sectionTitle": "可養狗屋苑參考名單", "introduction": "以下名單僅供參考，請向屋苑管理處查詢最新規定。", "estateLabel": "屋苑", "districtLabel": "地區", "notesLabel": "備註", "emptyState": "暫時未有屋苑資料。如需最新資訊，請"}, "guides": {"sectionTitle": "領養後指南", "catTitle": "貓隻領養後指南", "dogTitle": "狗隻領養後指南", "generalTitle": "領養後指南", "zhHkActionLabel": "中文版", "enActionLabel": "English"}, "rules": {"title": "領養規則"}, "care": {"cat": {"title": "養貓需知"}, "dog": {"title": "養狗需知"}}}
$adoption_instruction_content$::jsonb,
    1,
    now()
  )
  on conflict (page_key, revision_number) do nothing
  returning id
)
update public.adoption_instruction_pages page
set published_revision_id = coalesce(
      (select id from seeded_revision),
      (select id from public.adoption_instruction_revisions where page_key = page.page_key and revision_number = 1)
    ),
    updated_at = now()
where page.page_key = 'adoption-instructions'
  and page.published_revision_id is null;

alter table public.adoption_instruction_pages enable row level security;
alter table public.adoption_instruction_revisions enable row level security;
alter table public.adoption_instruction_publish_requests enable row level security;

grant select, insert, update, delete on public.adoption_instruction_pages to service_role;
grant select, insert, update, delete on public.adoption_instruction_revisions to service_role;
grant select, insert, update, delete on public.adoption_instruction_publish_requests to service_role;
revoke all on public.adoption_instruction_pages from anon, authenticated;
revoke all on public.adoption_instruction_revisions from anon, authenticated;
revoke all on public.adoption_instruction_publish_requests from anon, authenticated;

drop policy if exists "staff can read adoption instruction pages" on public.adoption_instruction_pages;
create policy "staff can read adoption instruction pages"
  on public.adoption_instruction_pages for select to authenticated
  using (private.has_admin_role(array['staff', 'admin']));
drop policy if exists "staff can update adoption instruction pages" on public.adoption_instruction_pages;
create policy "staff can update adoption instruction pages"
  on public.adoption_instruction_pages for update to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));
drop policy if exists "staff can read adoption instruction revisions" on public.adoption_instruction_revisions;
create policy "staff can read adoption instruction revisions"
  on public.adoption_instruction_revisions for select to authenticated
  using (private.has_admin_role(array['staff', 'admin']));
drop policy if exists "staff can create adoption instruction drafts" on public.adoption_instruction_revisions;
create policy "staff can create adoption instruction drafts"
  on public.adoption_instruction_revisions for insert to authenticated
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'admin'])
  );
drop policy if exists "staff can update adoption instruction drafts" on public.adoption_instruction_revisions;
create policy "staff can update adoption instruction drafts"
  on public.adoption_instruction_revisions for update to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'admin']))
  with check (state = 'draft' and private.has_admin_role(array['staff', 'admin']));
drop policy if exists "staff can read adoption instruction publish requests" on public.adoption_instruction_publish_requests;
create policy "staff can read adoption instruction publish requests"
  on public.adoption_instruction_publish_requests for select to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create or replace function private.require_adoption_instruction_actor(
  p_actor_user_id uuid,
  p_admin_only boolean default false
)
returns public.admin_user
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype;
begin
  select * into actor from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');
  if not found or (p_admin_only and actor.role <> 'admin') then
    raise exception 'Active % actor required', case when p_admin_only then 'admin' else 'staff or admin' end
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.ensure_adoption_instruction_draft(
  p_expected_page_version integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype; page public.adoption_instruction_pages%rowtype;
declare draft public.adoption_instruction_revisions%rowtype; published public.adoption_instruction_revisions%rowtype;
begin
  actor := private.require_adoption_instruction_actor(p_actor_user_id);
  select * into page from public.adoption_instruction_pages where page_key = 'adoption-instructions' for update;
  if page.version <> p_expected_page_version then raise exception 'Stale adoption instruction page version' using errcode = '40001'; end if;
  if page.draft_revision_id is not null then
    select * into draft from public.adoption_instruction_revisions where id = page.draft_revision_id for update;
    return to_jsonb(draft);
  end if;
  select * into published from public.adoption_instruction_revisions where id = page.published_revision_id for update;
  insert into public.adoption_instruction_revisions (page_key, revision_number, state, content, source_revision_id, created_by, updated_by, version)
  values ('adoption-instructions', (select coalesce(max(revision_number), 0) + 1 from public.adoption_instruction_revisions where page_key = 'adoption-instructions'), 'draft', published.content, published.id, actor.id, actor.id, page.version + 1)
  returning * into draft;
  update public.adoption_instruction_pages set draft_revision_id = draft.id, version = version + 1, updated_at = now() where page_key = page.page_key;
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail) values (p_actor_user_id, 'adoption_instruction.ensure_draft', 'adoption_instruction_revision', draft.id::text, jsonb_build_object('page_version', p_expected_page_version));
  return to_jsonb(draft);
end;
$$;

create or replace function public.update_adoption_instruction_draft(
  p_expected_version integer,
  p_content jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype; page public.adoption_instruction_pages%rowtype; draft public.adoption_instruction_revisions%rowtype;
begin
  actor := private.require_adoption_instruction_actor(p_actor_user_id);
  perform private.is_valid_adoption_instruction_content(p_content);
  if not private.is_valid_adoption_instruction_content(p_content) then raise exception 'Invalid adoption instruction content' using errcode = '23514'; end if;
  select * into page from public.adoption_instruction_pages where page_key = 'adoption-instructions' for update;
  if page.draft_revision_id is null then raise exception 'Adoption instruction draft not found' using errcode = 'P0002'; end if;
  select * into draft from public.adoption_instruction_revisions where id = page.draft_revision_id for update;
  if draft.version <> p_expected_version then raise exception 'Stale adoption instruction draft version' using errcode = '40001'; end if;
  update public.adoption_instruction_revisions set content = p_content, updated_by = actor.id, updated_at = now(), version = version + 1 where id = draft.id returning * into draft;
  update public.adoption_instruction_pages set version = version + 1, updated_at = now() where page_key = page.page_key;
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail) values (p_actor_user_id, 'adoption_instruction.update_draft', 'adoption_instruction_revision', draft.id::text, jsonb_build_object('expected_version', p_expected_version, 'result_version', draft.version));
  return to_jsonb(draft);
end;
$$;

create or replace function public.publish_adoption_instruction_page(
  p_expected_version integer,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype; page public.adoption_instruction_pages%rowtype; draft public.adoption_instruction_revisions%rowtype; previous public.adoption_instruction_revisions%rowtype; cached public.adoption_instruction_publish_requests%rowtype; result jsonb;
begin
  actor := private.require_adoption_instruction_actor(p_actor_user_id, true);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid publish idempotency key' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into cached from public.adoption_instruction_publish_requests where idempotency_key = p_idempotency_key for update;
  if found then
    if cached.revision_version <> p_expected_version or cached.actor_admin_id <> actor.id then raise exception 'Publish key belongs to a different request' using errcode = '40001'; end if;
    return cached.result;
  end if;
  select * into page from public.adoption_instruction_pages where page_key = 'adoption-instructions' for update;
  if page.draft_revision_id is null then raise exception 'Adoption instruction draft not found' using errcode = 'P0002'; end if;
  select * into draft from public.adoption_instruction_revisions where id = page.draft_revision_id for update;
  if draft.version <> p_expected_version then raise exception 'Stale adoption instruction draft version' using errcode = '40001'; end if;
  if not private.is_valid_adoption_instruction_content(draft.content) then raise exception 'Invalid adoption instruction content' using errcode = '23514'; end if;
  if page.published_revision_id is not null then
    select * into previous from public.adoption_instruction_revisions where id = page.published_revision_id for update;
    update public.adoption_instruction_revisions set state = 'archived', archived_by = actor.id, archived_at = now(), updated_by = actor.id, updated_at = now(), version = version + 1 where id = previous.id;
  end if;
  update public.adoption_instruction_revisions set state = 'published', published_by = actor.id, published_at = now(), updated_by = actor.id, updated_at = now(), version = version + 1 where id = draft.id returning * into draft;
  update public.adoption_instruction_pages set published_revision_id = draft.id, draft_revision_id = null, version = version + 1, updated_at = now() where page_key = page.page_key;
  result := jsonb_build_object('page_key', page.page_key, 'revision_id', draft.id, 'revision_version', draft.version);
  insert into public.adoption_instruction_publish_requests (actor_admin_id, idempotency_key, page_key, revision_id, revision_version, result) values (actor.id, p_idempotency_key, page.page_key, draft.id, p_expected_version, result);
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail) values (p_actor_user_id, 'adoption_instruction.publish', 'adoption_instruction_revision', draft.id::text, jsonb_build_object('previous_revision_id', previous.id, 'expected_version', p_expected_version));
  return result;
end;
$$;

create or replace function public.restore_adoption_instruction_revision(
  p_source_revision_id uuid,
  p_expected_page_version integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype; page public.adoption_instruction_pages%rowtype; source public.adoption_instruction_revisions%rowtype; draft public.adoption_instruction_revisions%rowtype;
begin
  actor := private.require_adoption_instruction_actor(p_actor_user_id, true);
  select * into page from public.adoption_instruction_pages where page_key = 'adoption-instructions' for update;
  if page.version <> p_expected_page_version then raise exception 'Stale adoption instruction page version' using errcode = '40001'; end if;
  if page.draft_revision_id is not null then raise exception 'Archive or publish the existing draft before restoring' using errcode = '23514'; end if;
  select * into source from public.adoption_instruction_revisions where id = p_source_revision_id and page_key = page.page_key for update;
  if not found then raise exception 'Adoption instruction revision not found' using errcode = 'P0002'; end if;
  if not private.is_valid_adoption_instruction_content(source.content) then raise exception 'Invalid adoption instruction content' using errcode = '23514'; end if;
  insert into public.adoption_instruction_revisions (page_key, revision_number, state, content, source_revision_id, created_by, updated_by, version) values ('adoption-instructions', (select coalesce(max(revision_number), 0) + 1 from public.adoption_instruction_revisions where page_key = 'adoption-instructions'), 'draft', source.content, source.id, actor.id, actor.id, page.version + 1) returning * into draft;
  update public.adoption_instruction_pages set draft_revision_id = draft.id, version = version + 1, updated_at = now() where page_key = page.page_key;
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail) values (p_actor_user_id, 'adoption_instruction.restore', 'adoption_instruction_revision', draft.id::text, jsonb_build_object('source_revision_id', source.id, 'expected_page_version', p_expected_page_version));
  return to_jsonb(draft);
end;
$$;

revoke all on function private.is_adoption_instruction_plain_text(text, integer) from public, anon, authenticated;
revoke all on function private.has_exact_jsonb_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.is_valid_adoption_instruction_content(jsonb) from public, anon, authenticated;
revoke all on function private.require_adoption_instruction_actor(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ensure_adoption_instruction_draft(integer, uuid) from public, anon, authenticated;
revoke all on function public.update_adoption_instruction_draft(integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.publish_adoption_instruction_page(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.restore_adoption_instruction_revision(uuid, integer, uuid) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.is_adoption_instruction_plain_text(text, integer) to service_role;
grant execute on function private.has_exact_jsonb_keys(jsonb, text[]) to service_role;
grant execute on function private.is_valid_adoption_instruction_content(jsonb) to service_role;
grant execute on function private.require_adoption_instruction_actor(uuid, boolean) to service_role;
grant execute on function public.ensure_adoption_instruction_draft(integer, uuid) to service_role;
grant execute on function public.update_adoption_instruction_draft(integer, jsonb, uuid) to service_role;
grant execute on function public.publish_adoption_instruction_page(integer, uuid, text) to service_role;
grant execute on function public.restore_adoption_instruction_revision(uuid, integer, uuid) to service_role;
