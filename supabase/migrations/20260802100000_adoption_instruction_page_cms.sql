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
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& expected
    and (select count(*) from jsonb_object_keys(candidate)) = cardinality(expected);
$$;

create or replace function private.is_valid_adoption_instruction_content(candidate jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  text_path text[];
  max_length integer;
  rule jsonb;
  topic jsonb;
begin
  if jsonb_typeof(candidate) <> 'object'
    or not private.has_exact_jsonb_keys(candidate, array['hero', 'fees', 'estates', 'guides', 'rules', 'care'])
    or not private.has_exact_jsonb_keys(candidate->'hero', array['eyebrow', 'title', 'description'])
    or not private.has_exact_jsonb_keys(candidate->'fees', array['sectionTitle', 'dogTitle', 'catTitle', 'itemLabel', 'amountLabel', 'notice'])
    or not private.has_exact_jsonb_keys(candidate->'estates', array['sectionTitle', 'introduction', 'estateLabel', 'districtLabel', 'notesLabel', 'emptyState'])
    or not private.has_exact_jsonb_keys(candidate->'guides', array['sectionTitle', 'catTitle', 'dogTitle', 'generalTitle', 'zhHkActionLabel', 'enActionLabel'])
    or not private.has_exact_jsonb_keys(candidate->'rules', array['title', 'items'])
    or not private.has_exact_jsonb_keys(candidate->'care', array['cat', 'dog'])
  then
    return false;
  end if;

  foreach text_path in array array[
    array['hero', 'eyebrow'], array['hero', 'title'], array['hero', 'description'],
    array['fees', 'sectionTitle'], array['fees', 'dogTitle'], array['fees', 'catTitle'],
    array['fees', 'itemLabel'], array['fees', 'amountLabel'], array['fees', 'notice'],
    array['estates', 'sectionTitle'], array['estates', 'introduction'], array['estates', 'estateLabel'],
    array['estates', 'districtLabel'], array['estates', 'notesLabel'], array['estates', 'emptyState'],
    array['guides', 'sectionTitle'], array['guides', 'catTitle'], array['guides', 'dogTitle'],
    array['guides', 'generalTitle'], array['guides', 'zhHkActionLabel'], array['guides', 'enActionLabel'],
    array['rules', 'title'], array['care', 'cat', 'title'], array['care', 'dog', 'title']
  ] loop
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
      or jsonb_typeof(candidate #> text_path) <> 'string'
      or not private.is_adoption_instruction_plain_text(candidate #>> text_path, max_length)
    then
      return false;
    end if;
  end loop;

  if jsonb_typeof(candidate->'rules'->'items') <> 'array'
    or jsonb_array_length(candidate->'rules'->'items') > 50
    or not private.has_exact_jsonb_keys(candidate->'care'->'cat', array['title', 'topics'])
    or not private.has_exact_jsonb_keys(candidate->'care'->'dog', array['title', 'topics'])
    or jsonb_typeof(candidate->'care'->'cat'->'topics') <> 'array'
    or jsonb_typeof(candidate->'care'->'dog'->'topics') <> 'array'
    or jsonb_array_length(candidate->'care'->'cat'->'topics') > 30
    or jsonb_array_length(candidate->'care'->'dog'->'topics') > 30
  then
    return false;
  end if;

  for rule in select value from jsonb_array_elements(candidate->'rules'->'items') loop
    if jsonb_typeof(rule) <> 'object'
      or not private.has_exact_jsonb_keys(rule, array['id', 'text'])
      or coalesce(rule->>'id', '') !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
      or not private.is_adoption_instruction_plain_text(rule->>'text', 1000)
    then
      return false;
    end if;
  end loop;

  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(candidate->'rules'->'items')) then
    return false;
  end if;

  foreach text_path in array array[array['care', 'cat', 'topics'], array['care', 'dog', 'topics']] loop
    for topic in select value from jsonb_array_elements(candidate #> text_path) loop
      if jsonb_typeof(topic) <> 'object'
        or not private.has_exact_jsonb_keys(topic, array['id', 'value', 'label', 'content'])
        or coalesce(topic->>'id', '') !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
        or coalesce(topic->>'value', '') !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
        or not private.is_adoption_instruction_plain_text(topic->>'label', 120)
        or not private.is_adoption_instruction_plain_text(topic->>'content', 2000)
      then
        return false;
      end if;
    end loop;

    if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(candidate #> text_path)) then
      return false;
    end if;
    if (select count(*) <> count(distinct value->>'value') from jsonb_array_elements(candidate #> text_path)) then
      return false;
    end if;
  end loop;

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
    {"hero":{"eyebrow":"領養準備","title":"領養需知","description":"了解申請、家訪和日常照護，為你和動物做好長期準備。"},"fees":{"sectionTitle":"領養費用","dogTitle":"狗隻領養費用","catTitle":"貓隻領養費用","itemLabel":"項目","amountLabel":"費用（HK$）","notice":"All prices subject to adjustment; HKSCDA reserves the right to amend."},"estates":{"sectionTitle":"可養狗屋苑參考名單","introduction":"以下名單僅供參考，請向屋苑管理處查詢最新規定。","estateLabel":"屋苑","districtLabel":"地區","notesLabel":"備註","emptyState":"暫時未有屋苑資料。如需最新資訊，請聯絡我們。"},"guides":{"sectionTitle":"領養後指南","catTitle":"貓隻領養後指南","dogTitle":"狗隻領養後指南","generalTitle":"領養後指南","zhHkActionLabel":"中文版","enActionLabel":"English"},"rules":{"title":"領養規則","items":[{"id":"applicant-age","text":"申請人須年滿18歲，並持有香港居留權或工作證。"},{"id":"accurate-details","text":"申請人須提供真實個人資料及住址，以便協會進行家訪。"},{"id":"fee-payment","text":"領養前須按本頁最新領養費用表繳付相關費用。"},{"id":"no-abandonment","text":"領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。"},{"id":"safe-home","text":"須確保動物生活在安全、舒適的室內環境。"},{"id":"health-checks","text":"須定期帶動物進行健康檢查及接種疫苗。"},{"id":"landlord-consent","text":"如住所為租住單位，須提供業主同意飼養寵物的書面証明。"},{"id":"follow-up-visit","text":"申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。"},{"id":"household-limit","text":"每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。"},{"id":"care-commitment","text":"申請人須了解並接受動物的生理及行為特性，有耐心照顧。"},{"id":"veterinary-care","text":"領養後如動物出現健康問題，須立即尋求獸醫協助。"},{"id":"association-discretion","text":"協會保留拒絕不合適申請的權利，並無需解釋原因。"}]},"care":{"cat":{"title":"養貓需知","topics":[{"id":"cat-home","value":"home","label":"家居","content":"為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。"},{"id":"cat-collection","value":"collection","label":"領取","content":"領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。"},{"id":"cat-food","value":"food","label":"糧食","content":"提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。"},{"id":"cat-cleaning","value":"cleaning","label":"清潔","content":"每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。"},{"id":"cat-health","value":"health","label":"保健","content":"半歲或以上為成貓。每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。"},{"id":"cat-supplies","value":"supplies","label":"用品","content":"必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。"},{"id":"cat-window","value":"window","label":"安窗","content":"必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。"}]},"dog":{"title":"養狗需知","topics":[{"id":"dog-home","value":"home","label":"家居","content":"為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。"},{"id":"dog-collection","value":"collection","label":"領取","content":"領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。"},{"id":"dog-food","value":"food","label":"食物","content":"提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。"},{"id":"dog-rest","value":"rest","label":"休息","content":"為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。"},{"id":"dog-cleaning","value":"cleaning","label":"清潔","content":"定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。"},{"id":"dog-health","value":"health","label":"保健","content":"每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。"},{"id":"dog-walk","value":"walk","label":"溜狗","content":"每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。"},{"id":"dog-training","value":"training","label":"教育","content":"盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。"}]}}
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
  insert into public.adoption_instruction_revisions (page_key, revision_number, state, content, source_revision_id, created_by, updated_by)
  values ('adoption-instructions', (select coalesce(max(revision_number), 0) + 1 from public.adoption_instruction_revisions where page_key = 'adoption-instructions'), 'draft', published.content, published.id, actor.id, actor.id)
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
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid publish idempotency key' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into cached from public.adoption_instruction_publish_requests where idempotency_key = p_idempotency_key for update;
  if found then return cached.result; end if;
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
  insert into public.adoption_instruction_publish_requests (idempotency_key, page_key, revision_id, revision_version, result) values (p_idempotency_key, page.page_key, draft.id, p_expected_version, result);
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
  insert into public.adoption_instruction_revisions (page_key, revision_number, state, content, source_revision_id, created_by, updated_by) values ('adoption-instructions', (select coalesce(max(revision_number), 0) + 1 from public.adoption_instruction_revisions where page_key = 'adoption-instructions'), 'draft', source.content, source.id, actor.id, actor.id) returning * into draft;
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
