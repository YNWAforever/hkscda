create table if not exists public.adoption_rules (
  id uuid primary key default gen_random_uuid(),
  content_zh text not null check (char_length(content_zh) between 1 and 500),
  content_en text not null check (char_length(content_en) between 1 and 500),
  sort_order integer not null check (sort_order >= 0),
  is_published boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sort_order)
);

create table if not exists public.care_topics (
  id uuid primary key default gen_random_uuid(),
  animal_type text not null check (animal_type in ('dog', 'cat')),
  label_zh text not null check (char_length(label_zh) between 1 and 40),
  label_en text not null check (char_length(label_en) between 1 and 40),
  content_zh text not null check (char_length(content_zh) between 1 and 1000),
  content_en text not null check (char_length(content_en) between 1 and 1000),
  sort_order integer not null check (sort_order >= 0),
  is_published boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (animal_type, sort_order)
);

create index if not exists adoption_rules_public_idx
  on public.adoption_rules (is_published, sort_order);

create index if not exists care_topics_public_idx
  on public.care_topics (animal_type, is_published, sort_order);

alter table public.adoption_rules enable row level security;
alter table public.care_topics enable row level security;

grant select, insert, update, delete on public.adoption_rules to service_role;
grant select, insert, update, delete on public.care_topics to service_role;

revoke all on public.adoption_rules from anon, authenticated;
revoke all on public.care_topics from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'adoption_rules',
    'care_topics'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create or replace function public.upsert_adoption_rule_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_content_zh text,
  p_content_en text,
  p_sort_order integer,
  p_is_published boolean
)
returns public.adoption_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  result public.adoption_rules;
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
    insert into public.adoption_rules (
      content_zh, content_en, sort_order, is_published,
      created_by, updated_by
    ) values (
      p_content_zh, p_content_en, p_sort_order, p_is_published,
      actor.id, actor.id
    )
    returning * into result;
  else
    update public.adoption_rules set
      content_zh = p_content_zh,
      content_en = p_content_en,
      sort_order = p_sort_order,
      is_published = p_is_published,
      updated_by = actor.id
    where id = p_id
    returning * into result;

    if not found then
      raise exception 'Adoption rule not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when p_id is null then 'adoption_rule.create' else 'adoption_rule.update' end,
    'adoption_rule',
    result.id::text,
    jsonb_build_object('sort_order', p_sort_order, 'is_published', p_is_published)
  );

  return result;
end;
$$;

revoke all on function public.upsert_adoption_rule_with_audit(
  uuid, uuid, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.upsert_adoption_rule_with_audit(
  uuid, uuid, text, text, integer, boolean
) to service_role;

create or replace function public.upsert_care_topic_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_animal_type text,
  p_label_zh text,
  p_label_en text,
  p_content_zh text,
  p_content_en text,
  p_sort_order integer,
  p_is_published boolean
)
returns public.care_topics
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  result public.care_topics;
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
    insert into public.care_topics (
      animal_type, label_zh, label_en, content_zh, content_en, sort_order, is_published,
      created_by, updated_by
    ) values (
      p_animal_type, p_label_zh, p_label_en, p_content_zh, p_content_en, p_sort_order, p_is_published,
      actor.id, actor.id
    )
    returning * into result;
  else
    update public.care_topics set
      animal_type = p_animal_type,
      label_zh = p_label_zh,
      label_en = p_label_en,
      content_zh = p_content_zh,
      content_en = p_content_en,
      sort_order = p_sort_order,
      is_published = p_is_published,
      updated_by = actor.id
    where id = p_id
    returning * into result;

    if not found then
      raise exception 'Care topic not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when p_id is null then 'care_topic.create' else 'care_topic.update' end,
    'care_topic',
    result.id::text,
    jsonb_build_object('animal_type', p_animal_type, 'is_published', p_is_published)
  );

  return result;
end;
$$;

revoke all on function public.upsert_care_topic_with_audit(
  uuid, uuid, text, text, text, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.upsert_care_topic_with_audit(
  uuid, uuid, text, text, text, text, text, integer, boolean
) to service_role;

insert into public.adoption_rules (content_zh, content_en, sort_order) values
('申請人須年滿18歲，並持有香港居留權或工作證。',
 'Applicants must be at least 18 years old and hold Hong Kong permanent residency or a valid work permit.', 0),
('申請人須提供真實個人資料及住址，以便協會進行家訪。',
 'Applicants must provide accurate personal details and address so the association can arrange a home visit.', 1),
('領養前須按本頁最新領養費用表繳付相關費用。',
 E'Applicants must pay the relevant fees according to this page\'s latest adoption fee table before adoption.', 2),
('領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。',
 'After adoption, the animal must not be abandoned, transferred, or sold; if you can no longer keep it, notify the association to arrange next steps.', 3),
('須確保動物生活在安全、舒適的室內環境。',
 'You must ensure the animal lives in a safe, comfortable indoor environment.', 4),
('須定期帶動物進行健康檢查及接種疫苗。',
 'You must bring the animal for regular health checks and vaccinations.', 5),
('如住所為租住單位，須提供業主同意飼養寵物的書面証明。',
 E'If you rent your home, you must provide written proof that your landlord permits keeping pets.', 6),
('申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。',
 E'Applicants must agree to follow-up home visits by the association to confirm the animal is well cared for.', 7),
('每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。',
 E'Each household may adopt up to two animals (exceptions require the association\'s approval).', 8),
('申請人須了解並接受動物的生理及行為特性，有耐心照顧。',
 E'Applicants must understand and accept the animal\'s physical and behavioural traits, and care for it with patience.', 9),
('領養後如動物出現健康問題，須立即尋求獸醫協助。',
 'If the animal develops health problems after adoption, seek veterinary help immediately.', 10),
('協會保留拒絕不合適申請的權利，並無需解釋原因。',
 E'The association reserves the right to decline unsuitable applications without giving a reason.', 11)
on conflict (sort_order) do update set
  content_zh = excluded.content_zh,
  content_en = excluded.content_en,
  updated_at = now();

insert into public.care_topics (animal_type, label_zh, label_en, content_zh, content_en, sort_order) values
('cat', '家居', 'Home',
 '為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。',
 E'Provide a safe indoor environment for your cat. Install protective netting to prevent falls or escapes through windows. Remove toxic plants and hazardous items from your home. Provide enough hiding spots and elevated resting spaces.', 0),
('cat', '領取', 'Collection',
 '領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。',
 E'Please bring your own carrier on collection day. A towel over the carrier can help reduce the cat\'s anxiety. Once home, let the cat settle into a quiet room at its own pace — don\'t rush introductions to other pets.', 1),
('cat', '糧食', 'Food',
 '提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。',
 'Provide high-quality cat food, mixing dry and wet food if you like. Always have fresh water available. Avoid feeding human food, especially onion, garlic, chocolate, and grapes.', 2),
('cat', '清潔', 'Cleaning',
 '每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。',
 'Clean the litter box daily and change the litter regularly. Groom your cat monthly — more often for long-haired cats. Trim nails regularly.', 3),
('cat', '保健', 'Health',
 '半歲或以上為成貓。每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。',
 'Cats six months or older are considered adults. Vaccinate and have a health check every year. Deworm regularly (internal and external parasites). Watch your cat\'s eating and toileting habits, and see a vet promptly if anything seems unusual.', 4),
('cat', '用品', 'Supplies',
 '必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。',
 'Essential supplies: a carrier, a litter box and litter, food and water bowls, a scratching post and toys, and grooming tools.', 5),
('cat', '安窗', 'Window',
 '必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。',
 'You must install cat netting or window guards to prevent falls from height or escape. Many types of netting suit different window styles — have it installed before your cat arrives.', 6),
('dog', '家居', 'Home',
 '為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。',
 'Provide a safe space for your dog and remove hazardous items. Prepare a comfortable dog bed or mat. Keep doors and windows closed to prevent escapes.', 0),
('dog', '領取', 'Collection',
 '領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。',
 'Please bring your own carrier or leash on collection day. Give your dog time to adjust to its new home in a calm environment.', 1),
('dog', '食物', 'Food',
 '提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。',
 'Provide quality dog food suited to your dog\'s size and age. Always have fresh water available. Avoid onion, garlic, chocolate, grapes, and overly salty food.', 2),
('dog', '休息', 'Rest',
 '為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。',
 'Give your dog a fixed resting spot. Puppies need more sleep each day — avoid disturbing them too much.', 3),
('dog', '清潔', 'Cleaning',
 '定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。',
 'Bathe and groom regularly. Clean ears and trim nails regularly. Train your dog to relieve itself in a designated spot.', 4),
('dog', '保健', 'Health',
 '每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。',
 'Vaccinate and deworm every year. Have regular veterinary checks. Watch for changes in your dog\'s eating and behaviour.', 5),
('dog', '溜狗', 'Walk',
 '每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。',
 'Walk your dog daily to provide adequate exercise. Always use a leash and dog tag outdoors. Only let your dog off-leash where it\'s permitted.', 6),
('dog', '教育', 'Training',
 '盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。',
 'Start basic obedience training early — sit, stay, recall, etc. Use positive reinforcement and avoid physical punishment. Seek help from a professional trainer for behavioural issues.', 7)
on conflict (animal_type, sort_order) do update set
  label_zh = excluded.label_zh,
  label_en = excluded.label_en,
  content_zh = excluded.content_zh,
  content_en = excluded.content_en,
  updated_at = now();
