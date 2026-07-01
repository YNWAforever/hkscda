begin;

set local timezone to 'Asia/Hong_Kong';

-- HKSCDA demo seed data.
-- Safe to rerun: every row uses fixed demo IDs and ON CONFLICT upserts.
-- Domain data only: this file must not create Supabase Auth users or admin_user rows.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

insert into public.living_area (id, name_zh, name_en, sort_order, is_active)
values
  ('20000000-0000-4000-8000-000000000001', '荃灣', 'Tsuen Wan', 10, true),
  ('20000000-0000-4000-8000-000000000002', '沙田', 'Sha Tin', 20, true),
  ('20000000-0000-4000-8000-000000000003', '將軍澳', 'Tseung Kwan O', 30, true),
  ('20000000-0000-4000-8000-000000000004', '西營盤', 'Sai Ying Pun', 40, true)
on conflict (id) do update
set name_zh = excluded.name_zh,
    name_en = excluded.name_en,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

insert into public.arrival_source (id, name_zh, name_en, sort_order, is_active)
values
  ('21000000-0000-4000-8000-000000000001', '街上救援', 'Street rescue', 10, true),
  ('21000000-0000-4000-8000-000000000002', '義工轉介', 'Volunteer referral', 20, true),
  ('21000000-0000-4000-8000-000000000003', '主人離世', 'Owner passed away', 30, true)
on conflict (id) do update
set name_zh = excluded.name_zh,
    name_en = excluded.name_en,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

insert into public.animal_position
  (id, name, type, for_cat, for_dog, address, contact_person, phone, email, is_active)
values
  ('22000000-0000-4000-8000-000000000001', 'HKSCDA 荃灣中心', 'shelter', true, true, '荃灣青山公路 88 號', 'Demo Shelter Team', '9123 0001', 'shelter-demo@example.test', true),
  ('22000000-0000-4000-8000-000000000002', '沙田暫託家庭 A', 'foster', true, false, '沙田第一城', 'Demo Foster A', '9123 0002', 'foster-a@example.test', true),
  ('22000000-0000-4000-8000-000000000003', '合作獸醫診所', 'clinic', true, true, '九龍旺角', 'Demo Clinic', '9123 0003', 'clinic-demo@example.test', true)
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    for_cat = excluded.for_cat,
    for_dog = excluded.for_dog,
    address = excluded.address,
    contact_person = excluded.contact_person,
    phone = excluded.phone,
    email = excluded.email,
    is_active = excluded.is_active;

insert into public.adoption_fee (id, description, amount_cents, is_active)
values
  ('23000000-0000-4000-8000-000000000001', 'Demo cat adoption fee', 80000, true),
  ('23000000-0000-4000-8000-000000000002', 'Demo dog adoption fee', 120000, true)
on conflict (id) do update
set description = excluded.description,
    amount_cents = excluded.amount_cents,
    is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- Animals
-- ---------------------------------------------------------------------------

insert into public.animals
  (id, type, name, name_en, gender, age, age_en, description, description_en, notes, notes_en, status, image_url, created_at, updated_at)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'cat',
    '小花',
    'Blossom',
    'female',
    '約 2 歲',
    'About 2 years old',
    '親人、愛玩，已習慣室內生活。適合第一次養貓的家庭。',
    'Affectionate and playful. Comfortable indoors and suitable for first-time cat adopters.',
    'Demo：已絕育，已打基本疫苗。',
    'Demo: desexed and core vaccinated.',
    'available',
    null,
    '2026-06-02 10:00:00+08',
    '2026-06-29 10:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'cat',
    '阿橙',
    'Tangerine',
    'male',
    '約 1 歲',
    'About 1 year old',
    '活潑好奇，喜歡與義工互動，需要有耐性的家庭慢慢建立信任。',
    'Curious and energetic. Enjoys volunteer interaction and needs a patient home.',
    'Demo：暫託家庭觀察中。',
    'Demo: currently observed in foster care.',
    'fostered',
    null,
    '2026-06-04 11:00:00+08',
    '2026-06-29 11:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'cat',
    '米米',
    'Mimi',
    'female',
    '約 8 個月',
    'About 8 months old',
    '溫柔怕羞，熟絡後會主動撒嬌。適合安靜家居。',
    'Gentle and shy. Becomes affectionate after settling in. Best for a calm home.',
    'Demo：需要安靜空間適應。',
    'Demo: needs a quiet space to settle.',
    'available',
    null,
    '2026-06-08 12:00:00+08',
    '2026-06-29 12:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'dog',
    'Lucky',
    'Lucky',
    'male',
    '約 3 歲',
    'About 3 years old',
    '友善、懂基本指令，散步時穩定。適合有養狗經驗家庭。',
    'Friendly, knows basic cues, and walks steadily. Best for an experienced dog home.',
    'Demo：需要每日散步及規律作息。',
    'Demo: needs daily walks and routine.',
    'available',
    null,
    '2026-06-09 09:30:00+08',
    '2026-06-29 09:30:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'dog',
    '豆豆',
    'Dodo',
    'female',
    '約 5 歲',
    'About 5 years old',
    '性格穩定，已完成領養流程。',
    'Calm temperament. Adoption process completed.',
    'Demo：成功領養示例。',
    'Demo: successful adoption example.',
    'adopted',
    null,
    '2026-06-01 09:00:00+08',
    '2026-06-25 18:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'sponsor',
    '老友記',
    'Grandpa',
    'male',
    '約 12 歲',
    'About 12 years old',
    '年長貓，需要長期藥物及定期覆診，適合助養支持。',
    'Senior cat needing long-term medication and follow-up visits. Suitable for sponsorship support.',
    'Demo：助養動物，暫不開放領養。',
    'Demo: sponsor animal, not currently open for adoption.',
    'fostered',
    null,
    '2026-06-03 15:00:00+08',
    '2026-06-29 15:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    'sponsor',
    '白雪',
    'Snowy',
    'female',
    '約 9 歲',
    'About 9 years old',
    '曾受傷的狗狗，現正康復中，需要助養支持醫療費。',
    'A recovering dog who needs sponsorship for medical care.',
    'Demo：醫療助養個案。',
    'Demo: medical sponsorship case.',
    'available',
    null,
    '2026-06-05 16:00:00+08',
    '2026-06-29 16:00:00+08'
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    'sponsor',
    '妹妹',
    'Mui Mui',
    'female',
    '約 10 歲',
    'About 10 years old',
    '安靜親人，因慢性腎病需要特別餐及定期檢查。',
    'Quiet and affectionate. Needs a special diet and checkups for chronic kidney disease.',
    'Demo：長期照顧助養個案。',
    'Demo: long-term care sponsorship case.',
    'available',
    null,
    '2026-06-07 17:00:00+08',
    '2026-06-29 17:00:00+08'
  )
on conflict (id) do update
set type = excluded.type,
    name = excluded.name,
    name_en = excluded.name_en,
    gender = excluded.gender,
    age = excluded.age,
    age_en = excluded.age_en,
    description = excluded.description,
    description_en = excluded.description_en,
    notes = excluded.notes,
    notes_en = excluded.notes_en,
    status = excluded.status,
    image_url = excluded.image_url,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.animal_profile_internal
  (animal_id, internal_code, arrival_date, arrival_source_id, current_position_id, cage, has_chip, chip_remarks, is_desexed, desexed_at, desex_remarks, is_adoptable, is_inside_support_pool, adopted_at, internal_remarks)
values
  ('10000000-0000-4000-8000-000000000001', 'DEMO-CAT-001', '2026-06-01', '21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'C-01', true, 'Demo chip ending 001', true, '2026-06-10', 'Recovered well', true, false, null, 'Demo internal profile'),
  ('10000000-0000-4000-8000-000000000002', 'DEMO-CAT-002', '2026-06-03', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'Foster A', false, null, true, '2026-06-12', 'Foster follow-up needed', true, false, null, 'Demo foster animal'),
  ('10000000-0000-4000-8000-000000000003', 'DEMO-CAT-003', '2026-06-08', '21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'C-03', true, 'Demo chip ending 003', false, null, 'Too young at intake', true, false, null, 'Demo kitten'),
  ('10000000-0000-4000-8000-000000000004', 'DEMO-DOG-001', '2026-06-09', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'D-01', true, 'Demo chip ending 004', true, '2026-06-14', 'Good recovery', true, false, null, 'Demo dog'),
  ('10000000-0000-4000-8000-000000000005', 'DEMO-DOG-002', '2026-06-01', '21000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', 'D-02', true, 'Demo chip ending 005', true, '2026-06-08', 'Adoption completed', false, false, '2026-06-25', 'Demo adopted dog'),
  ('10000000-0000-4000-8000-000000000006', 'DEMO-SPONSOR-001', '2026-06-03', '21000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000003', 'Clinic-01', true, 'Senior care chip', true, '2026-06-11', 'Senior case', false, true, null, 'Demo sponsor cat'),
  ('10000000-0000-4000-8000-000000000007', 'DEMO-SPONSOR-002', '2026-06-05', '21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000003', 'Clinic-02', true, 'Medical care chip', true, '2026-06-15', 'Medical hold', false, true, null, 'Demo sponsor dog'),
  ('10000000-0000-4000-8000-000000000008', 'DEMO-SPONSOR-003', '2026-06-07', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'C-08', true, 'Kidney care chip', true, '2026-06-16', 'Special diet', false, true, null, 'Demo sponsor cat')
on conflict (animal_id) do update
set internal_code = excluded.internal_code,
    arrival_date = excluded.arrival_date,
    arrival_source_id = excluded.arrival_source_id,
    current_position_id = excluded.current_position_id,
    cage = excluded.cage,
    has_chip = excluded.has_chip,
    chip_remarks = excluded.chip_remarks,
    is_desexed = excluded.is_desexed,
    desexed_at = excluded.desexed_at,
    desex_remarks = excluded.desex_remarks,
    is_adoptable = excluded.is_adoptable,
    is_inside_support_pool = excluded.is_inside_support_pool,
    adopted_at = excluded.adopted_at,
    internal_remarks = excluded.internal_remarks;

-- ---------------------------------------------------------------------------
-- Supporters, supporter roles, consent ledger, and adopters
-- ---------------------------------------------------------------------------

insert into public.supporter
  (id, name, email, phone, language, tags, source, deleted_at, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000001', '陳凱琳', 'demo.chan.hoi.lam@example.test', '9123 1001', 'zh-HK', array['demo', 'adopter', 'monthly-donor'], 'demo_seed', null, '2026-06-10 10:00:00+08', '2026-06-29 10:00:00+08'),
  ('30000000-0000-4000-8000-000000000002', '李家豪', 'demo.lee.ka.ho@example.test', '9123 1002', 'zh-HK', array['demo', 'adopter'], 'demo_seed', null, '2026-06-11 10:00:00+08', '2026-06-29 10:00:00+08'),
  ('30000000-0000-4000-8000-000000000003', '黃美儀', 'demo.wong.mei.yee@example.test', '9123 1003', 'zh-HK', array['demo', 'foster', 'donor'], 'demo_seed', null, '2026-06-12 10:00:00+08', '2026-06-29 10:00:00+08'),
  ('30000000-0000-4000-8000-000000000004', 'Sarah Ng', 'demo.sarah.ng@example.test', '9123 1004', 'en', array['demo', 'volunteer'], 'demo_seed', null, '2026-06-13 10:00:00+08', '2026-06-29 10:00:00+08'),
  ('30000000-0000-4000-8000-000000000005', '劉柏宇', 'demo.peter.lau@example.test', '9123 1005', 'zh-HK', array['demo', 'donor'], 'demo_seed', null, '2026-06-14 10:00:00+08', '2026-06-29 10:00:00+08'),
  ('30000000-0000-4000-8000-000000000006', '友心公司', 'demo.corporate.friend@example.test', '9123 1006', 'zh-HK', array['demo', 'corporate-donor'], 'demo_seed', null, '2026-06-15 10:00:00+08', '2026-06-29 10:00:00+08')
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    language = excluded.language,
    tags = excluded.tags,
    source = excluded.source,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.supporter_role (supporter_id, role)
values
  ('30000000-0000-4000-8000-000000000001', 'donor'),
  ('30000000-0000-4000-8000-000000000001', 'adopter'),
  ('30000000-0000-4000-8000-000000000002', 'adopter'),
  ('30000000-0000-4000-8000-000000000003', 'donor'),
  ('30000000-0000-4000-8000-000000000003', 'foster'),
  ('30000000-0000-4000-8000-000000000004', 'volunteer'),
  ('30000000-0000-4000-8000-000000000005', 'donor'),
  ('30000000-0000-4000-8000-000000000006', 'donor')
on conflict (supporter_id, role) do nothing;

insert into public.consent
  (id, supporter_id, channel, status, source, "timestamp", created_at, updated_at)
values
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'email', 'opt_in', 'demo_seed', '2026-06-10 10:05:00+08', '2026-06-10 10:05:00+08', '2026-06-10 10:05:00+08'),
  ('32000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'whatsapp', 'opt_in', 'demo_seed', '2026-06-10 10:05:00+08', '2026-06-10 10:05:00+08', '2026-06-10 10:05:00+08'),
  ('32000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'email', 'opt_in', 'demo_seed', '2026-06-11 10:05:00+08', '2026-06-11 10:05:00+08', '2026-06-11 10:05:00+08'),
  ('32000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'whatsapp', 'opt_in', 'demo_seed', '2026-06-12 10:05:00+08', '2026-06-12 10:05:00+08', '2026-06-12 10:05:00+08'),
  ('32000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004', 'email', 'opt_out', 'demo_seed', '2026-06-13 10:05:00+08', '2026-06-13 10:05:00+08', '2026-06-13 10:05:00+08'),
  ('32000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000005', 'email', 'opt_in', 'demo_seed', '2026-06-14 10:05:00+08', '2026-06-14 10:05:00+08', '2026-06-14 10:05:00+08')
on conflict (id) do update
set supporter_id = excluded.supporter_id,
    channel = excluded.channel,
    status = excluded.status,
    source = excluded.source,
    "timestamp" = excluded."timestamp",
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.adopter_profile
  (id, supporter_id, name_english, name_chinese, gender, hkid, birthday, occupation, facebook, household_size, monthly_household_income, living_area_id, address, floor_area, is_blacklisted, blacklist_reason, created_at, updated_at)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Helen Chan', '陳凱琳', 'female', null, '1991-03-12', 'Teacher', 'helen.demo.chan', '3', 'HKD 40,000 - 60,000', '20000000-0000-4000-8000-000000000001', '荃灣海濱花園 Demo座', '520 呎', false, null, '2026-06-10 10:10:00+08', '2026-06-29 10:10:00+08'),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Karl Lee', '李家豪', 'male', null, '1987-09-18', 'Designer', 'karl.demo.lee', '2', 'HKD 60,000+', '20000000-0000-4000-8000-000000000002', '沙田第一城 Demo室', '610 呎', false, null, '2026-06-11 10:10:00+08', '2026-06-29 10:10:00+08'),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Maggie Wong', '黃美儀', 'female', null, '1983-11-02', 'Nurse', 'maggie.demo.wong', '4', 'HKD 40,000 - 60,000', '20000000-0000-4000-8000-000000000003', '將軍澳中心 Demo座', '700 呎', false, null, '2026-06-12 10:10:00+08', '2026-06-29 10:10:00+08'),
  ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'Sarah Ng', '吳詩雅', 'female', null, '1994-05-20', 'Marketing Manager', 'sarah.demo.ng', '1', 'HKD 30,000 - 40,000', '20000000-0000-4000-8000-000000000004', '西營盤 Demo Court', '430 呎', true, 'Demo caution: previous application had incomplete landlord approval.', '2026-06-13 10:10:00+08', '2026-06-29 10:10:00+08')
on conflict (id) do update
set supporter_id = excluded.supporter_id,
    name_english = excluded.name_english,
    name_chinese = excluded.name_chinese,
    gender = excluded.gender,
    hkid = excluded.hkid,
    birthday = excluded.birthday,
    occupation = excluded.occupation,
    facebook = excluded.facebook,
    household_size = excluded.household_size,
    monthly_household_income = excluded.monthly_household_income,
    living_area_id = excluded.living_area_id,
    address = excluded.address,
    floor_area = excluded.floor_area,
    is_blacklisted = excluded.is_blacklisted,
    blacklist_reason = excluded.blacklist_reason,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

commit;
