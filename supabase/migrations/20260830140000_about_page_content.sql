create table if not exists public.about_page_content (
  page_slug text primary key check (page_slug in ('about', 'tnr', 'cccp')),
  content jsonb not null,
  updated_by uuid references public.admin_user(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.about_page_content enable row level security;

grant select, insert, update, delete on public.about_page_content to service_role;
revoke all on public.about_page_content from anon, authenticated;

create or replace function public.upsert_about_page_content_with_audit(
  p_actor_user_id uuid,
  p_page_slug text,
  p_content jsonb
)
returns public.about_page_content
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
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

  if p_page_slug not in ('about', 'tnr', 'cccp') then
    raise exception 'Unknown about page slug' using errcode = '22023';
  end if;

  insert into public.about_page_content (page_slug, content, updated_by, updated_at)
  values (p_page_slug, p_content, actor.id, now())
  on conflict (page_slug) do update set
    content = excluded.content,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into result;

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

revoke all on function public.upsert_about_page_content_with_audit(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_about_page_content_with_audit(uuid, text, jsonb)
  to service_role;

insert into public.about_page_content (page_slug, content) values
('about', '{
  "hero": {"eyebrow": "香港本地動物救援慈善機構", "title": "領養代替購買", "description": "救援、醫療、絕育與負責任領養，以社區力量守護香港流浪貓狗。"},
  "mission": {"eyebrow": "我們的使命", "title": "讓每一個生命都有重新開始的機會", "body": "香港拯救貓狗協會自2007年起，透過救援、醫療、絕育和領養工作，為被遺棄及流浪動物提供實際支援。我們相信負責任的領養需要透明資訊、耐心配對和社區共同參與。", "sideBadge": "以動物福祉為先", "sideBody": "我們與義工、領養家庭及社區夥伴一起，讓照護和善意可以持續發生。"},
  "impact": {"eyebrow": "可核實的公開資料", "title": "目前照護中的動物", "description": "數字只在資料庫成功回傳並大於零時顯示，並標示資料日期。"},
  "journey": {"eyebrow": "我們如何工作", "title": "從救援到找到家，四個重要步驟", "steps": [
    {"title": "救援", "description": "接收需要即時協助的流浪、受傷或被遺棄貓狗。"},
    {"title": "醫療照護", "description": "安排檢查、治療、疫苗和日常照護，讓動物恢復健康。"},
    {"title": "絕育", "description": "透過絕育及社區合作，減少繁殖和流浪動物數目。"},
    {"title": "配對領養", "description": "了解家庭需要，為動物配對負責任而長久的家。"}
  ]},
  "communityBand": {"eyebrow": "社區合作", "title": "CCCP 與 TNR，從源頭改善動物處境", "description": "社區貓隻照顧計劃和捕捉、絕育、放回工作，讓動物福利不只發生在收容和領養，也能在社區中長久改善。", "cccpCard": {"title": "CCCP 計劃", "description": "了解社區貓隻照顧的合作方法。"}, "tnrCard": {"title": "TNR 計劃", "description": "了解捕捉、絕育、放回的社區行動。"}},
  "responsibleAdoption": {"eyebrow": "負責任領養", "title": "領養是一段需要準備的長期承諾", "body": "了解家庭環境、時間安排和照護能力，讓你和動物都能安心開始。領養費用及流程等操作指引，請參閱領養需知。", "linkLabel": "閱讀領養需知", "sideTitle": "我們重視的配對原則", "principles": ["先了解動物需要，再評估家庭是否合適", "把醫療、絕育和日常照護納入長期規劃", "以耐心和責任建立穩定而安全的關係"]},
  "helpPaths": {"eyebrow": "一起幫助", "title": "你可以用四種方式加入", "items": [
    {"title": "領養動物", "description": "看看正在等待家庭的貓貓和狗狗。", "label": "查看待領養動物"},
    {"title": "助養生命", "description": "以每月支持幫助動物獲得持續照護。", "label": "了解助養"},
    {"title": "加入義工", "description": "用時間和專長支援救援及社區工作。", "label": "加入義工"},
    {"title": "立即捐助", "description": "支持醫療、絕育和日常救援所需。", "label": "支持協會"}
  ]},
  "closing": {"title": "讓下一個家，從今天開始", "description": "看看正在等待領養的動物，或者用你的支持讓更多救援可以繼續。", "buttonLabel": "查看待領養動物"}
}'::jsonb),
('tnr', '{
  "hero": {"eyebrow": "我們的工作", "title": "TNR 捕捉絕育放回", "description": "誘捕、絕育、放回（Trap-Neuter-Return）是管理社區流浪貓的其中一種人道方法，透過捕捉、絕育和原地放回，配合持續照顧，逐步減少繁殖壓力。"},
  "stages": [
    {"title": "誘捕 Trap", "description": "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。"},
    {"title": "絕育 Neuter", "description": "送往合作獸醫診所進行絕育手術，同時安排基本健康檢查。"},
    {"title": "放回 Return", "description": "手術後在原地放回，繼續由 CCCP 義工照顧和觀察。"}
  ],
  "chapter": {"title": "社區參與", "description": "如果你發現社區有需要協助的流浪貓，請先記錄地點、數量和狀況，再聯絡協會了解合適的支援方法。正確的資訊和持續觀察，有助義工安排後續工作。", "bullets": ["記錄地點與數量", "留意受傷或疾病徵狀", "聯絡協會安排跟進"]},
  "cta": {"eyebrow": "一起參與", "title": "TNR 需要社區的眼睛和雙手。", "descriptionPrefix": "義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵"}
}'::jsonb),
('cccp', '{
  "hero": {"eyebrow": "我們的工作", "title": "CCCP 社區貓照顧計劃", "description": "社區貓照顧計劃（Community Cat Care Program）以社區參與、日常觀察和絕育合作，建立可持續的照顧網絡。"},
  "chapters": [
    {"title": "什麼是 CCCP", "description": "CCCP 是香港拯救貓狗協會推行的社區流浪貓管理計劃。計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合 TNR 絕育工作，逐步改善貓隻和社區的生活質素。"},
    {"title": "為何需要 CCCP", "description": "有系統的照顧能讓社區居民與流浪貓和諧共存，並及早發現受傷、疾病和未絕育的貓隻，連接合適的義工和獸醫支援。"}
  ],
  "workRows": [
    {"scope": "日常照顧", "method": "定點餵食、清潔和觀察", "result": "及早發現需要協助的動物"},
    {"scope": "絕育合作", "method": "配合 TNR 安排手術", "result": "減少繁殖和流浪壓力"},
    {"scope": "社區溝通", "method": "由義工連接居民和協會", "result": "降低衝突，分享正確照顧方法"}
  ],
  "workSectionTitle": "CCCP 的工作方式",
  "cta": {"eyebrow": "參與其中", "title": "你可以擔任義工、捐款或捐贈物資。", "description": "如有興趣參與社區貓照顧工作，可先了解目前的義工崗位，或直接聯絡團隊。", "points": ["義工訓練與日常照顧", "配合絕育安排", "社區溝通與教育"]}
}'::jsonb)
on conflict (page_slug) do update set
  content = excluded.content,
  updated_at = now();
