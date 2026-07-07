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

-- ---------------------------------------------------------------------------
-- Donations, payments, and receipts
-- ---------------------------------------------------------------------------

insert into public.donation
  (id, supporter_id, amount_cents, currency, purpose, type, recurring_id, status, method, receipt_requested, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 50000, 'HKD', 'general', 'one_time', null, 'succeeded', 'fps', true, '2026-06-16 09:00:00+08', '2026-06-16 09:05:00+08'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 120000, 'HKD', 'medical', 'one_time', null, 'succeeded', 'payme', true, '2026-06-17 09:00:00+08', '2026-06-17 09:05:00+08'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', 30000, 'HKD', 'sponsor', 'one_time', null, 'pending', 'manual', true, '2026-06-18 09:00:00+08', '2026-06-18 09:05:00+08'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000006', 250000, 'HKD', 'general', 'one_time', null, 'succeeded', 'stripe', false, '2026-06-19 09:00:00+08', '2026-06-19 09:05:00+08'),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 80000, 'HKD', 'sponsor', 'one_time', null, 'succeeded', 'fps', false, '2026-06-20 09:00:00+08', '2026-06-20 09:05:00+08'),
  ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000004', 20000, 'HKD', 'medical', 'one_time', null, 'pending', 'payme', false, '2026-06-21 09:00:00+08', '2026-06-21 09:05:00+08')
on conflict (id) do update
set supporter_id = excluded.supporter_id,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    purpose = excluded.purpose,
    type = excluded.type,
    recurring_id = excluded.recurring_id,
    status = excluded.status,
    method = excluded.method,
    receipt_requested = excluded.receipt_requested,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.payment
  (id, donation_id, provider, provider_ref, amount_cents, status, received_at, reconciled_by, bank_reference, created_at, updated_at)
values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'fps', 'DEMO-FPS-001', 50000, 'succeeded', '2026-06-16 09:03:00+08', null, 'FPS-DEMO-001', '2026-06-16 09:00:00+08', '2026-06-16 09:05:00+08'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'payme', 'DEMO-PAYME-002', 120000, 'succeeded', '2026-06-17 09:03:00+08', null, 'PAYME-DEMO-002', '2026-06-17 09:00:00+08', '2026-06-17 09:05:00+08'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'manual', 'DEMO-MANUAL-003', 30000, 'pending', null, null, 'MANUAL-DEMO-003', '2026-06-18 09:00:00+08', '2026-06-18 09:05:00+08'),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'stripe', 'pi_demo_004', 250000, 'succeeded', '2026-06-19 09:03:00+08', null, null, '2026-06-19 09:00:00+08', '2026-06-19 09:05:00+08'),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'fps', 'DEMO-FPS-005', 80000, 'succeeded', '2026-06-20 09:03:00+08', null, 'FPS-DEMO-005', '2026-06-20 09:00:00+08', '2026-06-20 09:05:00+08'),
  ('41000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006', 'payme', 'DEMO-PAYME-006', 20000, 'pending', null, null, 'PAYME-DEMO-006', '2026-06-21 09:00:00+08', '2026-06-21 09:05:00+08')
on conflict (id) do update
set donation_id = excluded.donation_id,
    provider = excluded.provider,
    provider_ref = excluded.provider_ref,
    amount_cents = excluded.amount_cents,
    status = excluded.status,
    received_at = excluded.received_at,
    reconciled_by = excluded.reconciled_by,
    bank_reference = excluded.bank_reference,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.receipt
  (id, supporter_id, receipt_no, donation_ids, total_amount_cents, tax_year, issued_at, pdf_url, status, voided_at, voided_by, created_at, updated_at)
values
  ('42000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'HKSCDA-2026-DEMO001', array['40000000-0000-4000-8000-000000000001'::uuid], 50000, 2026, '2026-06-16 10:00:00+08', null, 'issued', null, null, '2026-06-16 10:00:00+08', '2026-06-16 10:00:00+08'),
  ('42000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'HKSCDA-2026-DEMO002', array['40000000-0000-4000-8000-000000000002'::uuid], 120000, 2026, '2026-06-17 10:00:00+08', null, 'issued', null, null, '2026-06-17 10:00:00+08', '2026-06-17 10:00:00+08')
on conflict (id) do update
set supporter_id = excluded.supporter_id,
    receipt_no = excluded.receipt_no,
    donation_ids = excluded.donation_ids,
    total_amount_cents = excluded.total_amount_cents,
    tax_year = excluded.tax_year,
    issued_at = excluded.issued_at,
    pdf_url = excluded.pdf_url,
    status = excluded.status,
    voided_at = excluded.voided_at,
    voided_by = excluded.voided_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- Adoption applications and coordinator cases
-- ---------------------------------------------------------------------------

insert into public.adoption_applications
  (id, animal_id, animal_name, animal_type, applicant_name, phone, email, address, housing_type, family_size, existing_pets, reason, status, created_at)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '米米', 'cat', '陳凱琳', '9123 1001', 'demo.chan.hoi.lam@example.test', '荃灣海濱花園 Demo座', '私人住宅', 3, '沒有', '希望領養一隻性格安靜的幼貓。', 'pending', '2026-06-22 10:00:00+08'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'Lucky', 'dog', '黃美儀', '9123 1003', 'demo.wong.mei.yee@example.test', '將軍澳中心 Demo座', '私人住宅', 4, '一隻年長貓', '家庭有照顧動物經驗，希望領養狗狗。', 'pending', '2026-06-23 10:00:00+08'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '小花', 'cat', 'Sarah Ng', '9123 1004', 'demo.sarah.ng@example.test', '西營盤 Demo Court', '租住房屋', 1, '沒有', '希望與貓貓互相陪伴。', 'pending', '2026-06-24 10:00:00+08'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', '豆豆', 'dog', '李家豪', '9123 1002', 'demo.lee.ka.ho@example.test', '沙田第一城 Demo室', '私人住宅', 2, '沒有', '有固定時間散步，適合照顧穩定狗狗。', 'approved', '2026-06-15 10:00:00+08'),
  ('50000000-0000-4000-8000-000000000005', null, '未決定', 'cat', '劉柏宇', '9123 1005', 'demo.peter.lau@example.test', '太古城 Demo座', '私人住宅', 2, '兩隻幼貓', '希望再領養一隻貓。', 'rejected', '2026-06-18 10:00:00+08')
on conflict (id) do update
set animal_id = excluded.animal_id,
    animal_name = excluded.animal_name,
    animal_type = excluded.animal_type,
    applicant_name = excluded.applicant_name,
    phone = excluded.phone,
    email = excluded.email,
    address = excluded.address,
    housing_type = excluded.housing_type,
    family_size = excluded.family_size,
    existing_pets = excluded.existing_pets,
    reason = excluded.reason,
    status = excluded.status,
    created_at = excluded.created_at;

insert into public.adoption_case
  (id, public_application_id, status_id, adopter_profile_id, supporter_id, requested_animal_id, approved_animal_id, animal_type, applicant_name, applicant_phone, applicant_email, applicant_address, housing_type, family_size, existing_pets, reason, assessment, preferences, processed, assigned_to, closed_at, source, created_by, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', (select id from public.coordinator_status where category = 'adoption_case' and key = 'new'), '31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', null, 'cat', '陳凱琳', '9123 1001', 'demo.chan.hoi.lam@example.test', '荃灣海濱花園 Demo座', '私人住宅', 3, '沒有', '希望領養一隻性格安靜的幼貓。', '{"home":"stable","experience":"first_cat"}'::jsonb, '{"animalTemperament":"calm","preferredAnimal":"米米"}'::jsonb, false, null, null, 'public_form', null, '2026-06-22 10:05:00+08', '2026-06-29 10:05:00+08'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', (select id from public.coordinator_status where category = 'adoption_case' and key = 'screening'), '31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', null, 'dog', '黃美儀', '9123 1003', 'demo.wong.mei.yee@example.test', '將軍澳中心 Demo座', '私人住宅', 4, '一隻年長貓', '家庭有照顧動物經驗，希望領養狗狗。', '{"home":"stable","experience":"dog_and_cat"}'::jsonb, '{"preferredAnimal":"Lucky","walkSchedule":"twice_daily"}'::jsonb, false, null, null, 'public_form', null, '2026-06-23 10:05:00+08', '2026-06-29 10:05:00+08'),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', (select id from public.coordinator_status where category = 'adoption_case' and key = 'matching'), '31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', null, 'cat', 'Sarah Ng', '9123 1004', 'demo.sarah.ng@example.test', '西營盤 Demo Court', '租住房屋', 1, '沒有', '希望與貓貓互相陪伴。', '{"home":"needs_landlord_confirmation","experience":"new_adopter"}'::jsonb, '{"preferredAnimal":"小花","notes":"needs quiet cat"}'::jsonb, true, null, null, 'public_form', null, '2026-06-24 10:05:00+08', '2026-06-29 10:05:00+08'),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', (select id from public.coordinator_status where category = 'adoption_case' and key = 'approved'), '31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'dog', '李家豪', '9123 1002', 'demo.lee.ka.ho@example.test', '沙田第一城 Demo室', '私人住宅', 2, '沒有', '有固定時間散步，適合照顧穩定狗狗。', '{"home":"approved","experience":"experienced_dog_home"}'::jsonb, '{"preferredAnimal":"豆豆"}'::jsonb, true, null, '2026-06-25 18:00:00+08', 'public_form', null, '2026-06-15 10:05:00+08', '2026-06-25 18:00:00+08'),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', (select id from public.coordinator_status where category = 'adoption_case' and key = 'rejected'), null, '30000000-0000-4000-8000-000000000005', null, null, 'cat', '劉柏宇', '9123 1005', 'demo.peter.lau@example.test', '太古城 Demo座', '私人住宅', 2, '兩隻幼貓', '希望再領養一隻貓。', '{"home":"not_suitable","reason":"too_many_young_pets"}'::jsonb, '{"preferredAnimal":"open"}'::jsonb, true, null, '2026-06-26 11:00:00+08', 'public_form', null, '2026-06-18 10:05:00+08', '2026-06-26 11:00:00+08')
on conflict (id) do update
set public_application_id = excluded.public_application_id,
    status_id = excluded.status_id,
    adopter_profile_id = excluded.adopter_profile_id,
    supporter_id = excluded.supporter_id,
    requested_animal_id = excluded.requested_animal_id,
    approved_animal_id = excluded.approved_animal_id,
    animal_type = excluded.animal_type,
    applicant_name = excluded.applicant_name,
    applicant_phone = excluded.applicant_phone,
    applicant_email = excluded.applicant_email,
    applicant_address = excluded.applicant_address,
    housing_type = excluded.housing_type,
    family_size = excluded.family_size,
    existing_pets = excluded.existing_pets,
    reason = excluded.reason,
    assessment = excluded.assessment,
    preferences = excluded.preferences,
    processed = excluded.processed,
    assigned_to = excluded.assigned_to,
    closed_at = excluded.closed_at,
    source = excluded.source,
    created_by = excluded.created_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.animal_match
  (id, adoption_case_id, animal_id, status_id, is_approved, notes, created_by, updated_by, created_at, updated_at)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', (select id from public.coordinator_status where category = 'match' and key = 'proposed'), false, 'Demo proposed match for 米米.', null, null, '2026-06-22 12:00:00+08', '2026-06-29 12:00:00+08'),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', (select id from public.coordinator_status where category = 'match' and key = 'shortlisted'), false, 'Demo shortlisted match for 小花; landlord confirmation pending.', null, null, '2026-06-24 12:00:00+08', '2026-06-29 12:00:00+08'),
  ('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', (select id from public.coordinator_status where category = 'match' and key = 'approved'), true, 'Demo approved match; adoption completed.', null, null, '2026-06-20 12:00:00+08', '2026-06-25 18:00:00+08')
on conflict (id) do update
set adoption_case_id = excluded.adoption_case_id,
    animal_id = excluded.animal_id,
    status_id = excluded.status_id,
    is_approved = excluded.is_approved,
    notes = excluded.notes,
    created_by = excluded.created_by,
    updated_by = excluded.updated_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.adoption_followup
  (id, adoption_case_id, adopter_profile_id, animal_id, status_id, title, scheduled_at, completed_at, has_window_net, environment, score, volunteer, remarks, task_type, priority, due_at, assigned_to, contact_channel, outcome, next_step_at, created_by, updated_by, created_at, updated_at)
values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', (select id from public.coordinator_status where category = 'followup' and key = 'open'), '致電確認米米申請資料', null, null, null, null, null, 'Demo Volunteer A', '確認家中窗網及適應空間。', 'phone_call', 'high', '2026-07-02 15:00:00+08', 'coordinator-a@example.test', 'phone', null, '2026-07-03 10:00:00+08', null, null, '2026-06-22 13:00:00+08', '2026-06-29 13:00:00+08'),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', (select id from public.coordinator_status where category = 'followup' and key = 'scheduled'), '安排 Lucky 家訪', '2026-07-04 11:00:00+08', null, true, '有足夠活動空間', 'pending', 'Demo Volunteer B', '家訪前提醒準備住址證明。', 'home_visit', 'normal', '2026-07-04 11:00:00+08', 'coordinator-b@example.test', 'whatsapp', null, '2026-07-05 12:00:00+08', null, null, '2026-06-23 13:00:00+08', '2026-06-29 13:00:00+08'),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', (select id from public.coordinator_status where category = 'followup' and key = 'scheduled'), '跟進業主同意文件', '2026-07-01 16:00:00+08', null, null, '租住房屋，需文件確認', 'pending', 'Demo Volunteer C', '候選配對仍在等待文件。', 'document_check', 'urgent', '2026-07-01 16:00:00+08', 'coordinator-c@example.test', 'email', null, '2026-07-02 12:00:00+08', null, null, '2026-06-24 13:00:00+08', '2026-06-29 13:00:00+08'),
  ('53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', (select id from public.coordinator_status where category = 'followup' and key = 'completed'), '豆豆接領後回訪', '2026-06-28 14:00:00+08', '2026-06-28 14:45:00+08', true, '適應良好', 'passed', 'Demo Volunteer D', '領養人回報豆豆食慾正常。', 'post_adoption_check', 'normal', '2026-06-28 14:00:00+08', 'coordinator-d@example.test', 'whatsapp', '完成，無需即時跟進', null, null, null, '2026-06-25 13:00:00+08', '2026-06-28 14:45:00+08'),
  ('53000000-0000-4000-8000-000000000005', null, '31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', (select id from public.coordinator_status where category = 'followup' and key = 'open'), '白雪助養更新相片', null, null, null, null, null, 'Demo Volunteer E', '為助養人準備醫療近況。', 'sponsor_update', 'low', '2026-07-06 12:00:00+08', 'sponsor-team@example.test', 'internal', null, '2026-07-08 12:00:00+08', null, null, '2026-06-26 13:00:00+08', '2026-06-29 13:00:00+08')
on conflict (id) do update
set adoption_case_id = excluded.adoption_case_id,
    adopter_profile_id = excluded.adopter_profile_id,
    animal_id = excluded.animal_id,
    status_id = excluded.status_id,
    title = excluded.title,
    scheduled_at = excluded.scheduled_at,
    completed_at = excluded.completed_at,
    has_window_net = excluded.has_window_net,
    environment = excluded.environment,
    score = excluded.score,
    volunteer = excluded.volunteer,
    remarks = excluded.remarks,
    task_type = excluded.task_type,
    priority = excluded.priority,
    due_at = excluded.due_at,
    assigned_to = excluded.assigned_to,
    contact_channel = excluded.contact_channel,
    outcome = excluded.outcome,
    next_step_at = excluded.next_step_at,
    created_by = excluded.created_by,
    updated_by = excluded.updated_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.successful_adoption
  (id, adoption_case_id, animal_id, adopter_profile_id, supporter_id, outcome_status_id, case_number, adoption_fee_cents, approval_date, pickup_date, approved_by, created_at, updated_at)
values
  ('54000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', '31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', (select id from public.coordinator_status where category = 'final_outcome' and key = 'adopted'), 'DEMO-ADOPT-2026-001', 120000, '2026-06-25', '2026-06-28', null, '2026-06-25 18:00:00+08', '2026-06-28 14:45:00+08')
on conflict (id) do update
set adoption_case_id = excluded.adoption_case_id,
    animal_id = excluded.animal_id,
    adopter_profile_id = excluded.adopter_profile_id,
    supporter_id = excluded.supporter_id,
    outcome_status_id = excluded.outcome_status_id,
    case_number = excluded.case_number,
    adoption_fee_cents = excluded.adoption_fee_cents,
    approval_date = excluded.approval_date,
    pickup_date = excluded.pickup_date,
    approved_by = excluded.approved_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- Story and promotion center content
-- ---------------------------------------------------------------------------

insert into public.content_item
  (id, slug, type, title, subtitle, summary, body, cover_media_id, status, published_at, cta_label, cta_url, seo_title, seo_description, og_title, og_description, created_at, updated_at)
values
  (
    '70000000-0000-4000-8000-000000000001',
    'demo-siu-bak-recovery',
    'rescue_story',
    '【示範】小白康復中',
    '完成疫苗後於暫養家庭休養',
    '小白由深水埗救援後已完成初步檢查及疫苗，現正於暫養家庭慢慢恢復信任。',
    '小白初到時十分怕人，義工以少量多餐和安靜空間協助牠穩定。獸醫檢查後確認牠需要完成疫苗及營養補充。最新狀況良好，暫養家庭每天記錄食慾和精神狀態。',
    null,
    'published',
    '2026-07-05 09:00:00+08',
    '支持醫療基金',
    '/donate',
    '小白康復中 · HKSCDA 救援故事',
    '小白由深水埗救援後完成疫苗，正在暫養家庭康復。',
    '小白康復中',
    '追蹤小白的醫療與暫養更新。',
    '2026-07-05 09:00:00+08',
    '2026-07-06 20:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'demo-lucky-ready-for-adoption',
    'rescue_story',
    '【示範】Lucky 準備尋家',
    '由戶外救援到重新學習散步',
    'Lucky 在元朗被救援後完成基本檢查，性格親人，正準備進入領養配對。',
    'Lucky 起初對拖帶和車聲較敏感，義工每日以短距離散步重新建立安全感。牠現在能穩定跟隨指令，亦願意主動接近熟悉的人。',
    null,
    'published',
    '2026-07-04 10:00:00+08',
    '查看領養須知',
    '/adoption/instructions',
    'Lucky 準備尋家 · HKSCDA 救援故事',
    'Lucky 完成基本檢查，正在等待合適家庭。',
    'Lucky 準備尋家',
    '由救援到準備領養的最新進展。',
    '2026-07-04 10:00:00+08',
    '2026-07-04 18:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    'demo-orange-sponsor-needed',
    'rescue_story',
    '【示範】阿橘需要助養',
    '長期照護個案需要穩定支援',
    '阿橘在觀塘區救援，現需定期覆診及慢性病照護，等待助養人支援。',
    '阿橘年紀較大，血液報告顯示需要長期監察。牠現由義工照顧，食慾穩定但仍需定期覆診及藥物。每份助養都能分擔牠的醫療和日常照護。',
    null,
    'published',
    '2026-07-03 14:00:00+08',
    '成為助養人',
    '/sponsors',
    '阿橘需要助養 · HKSCDA 救援故事',
    '阿橘需要長期醫療和日常照護支援。',
    '阿橘需要助養',
    '了解阿橘的長期照護需要。',
    '2026-07-03 14:00:00+08',
    '2026-07-03 16:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    'demo-summer-adoption-day',
    'event',
    '【示範】夏日領養日',
    '與等待家庭的毛孩見面',
    '週末領養日將展示多隻已完成基本檢查的貓狗，歡迎預約探訪。',
    '活動設有義工導賞、領養流程簡介和照顧準備問答。為保障動物狀態，請先完成網上領養申請或以 WhatsApp 預約。',
    null,
    'published',
    '2026-07-02 12:00:00+08',
    '填寫領養申請',
    '/adoption/apply',
    '夏日領養日 · HKSCDA',
    '預約參與夏日領養日，認識等待家庭的貓狗。',
    '夏日領養日',
    '與等待家庭的毛孩見面。',
    '2026-07-02 12:00:00+08',
    '2026-07-02 12:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    'demo-charity-market-july',
    'charity_market',
    '【示範】七月慈善市集',
    '義賣收益支持醫療個案',
    '本月慈善市集設有寵物用品、手作小物及義工分享，收益撥作救援醫療基金。',
    '市集由義工團隊籌備，現場會分享近期救援個案和物資需要。歡迎捐贈全新或狀態良好的寵物用品作義賣。',
    null,
    'published',
    '2026-07-01 11:00:00+08',
    '支持捐款',
    '/donate',
    '七月慈善市集 · HKSCDA',
    '慈善市集收益支持救援醫療基金。',
    '七月慈善市集',
    '義賣支持醫療個案。',
    '2026-07-01 11:00:00+08',
    '2026-07-01 11:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000006',
    'demo-rescue-report-june',
    'report',
    '【示範】六月救援報告',
    '透明公開近期救援與領養數據',
    '六月完成多宗救援、醫療跟進及領養配對，報告摘要公開供支持者查閱。',
    '本月報告整理救援地區、醫療支出類別、領養進度和義工參與情況。完整財務及個案資料會按私隱規則分級公開。',
    null,
    'published',
    '2026-06-30 18:00:00+08',
    '查看領養報告',
    '/report/adoption',
    '六月救援報告 · HKSCDA',
    '六月救援與領養摘要。',
    '六月救援報告',
    '透明公開近期救援與領養數據。',
    '2026-06-30 18:00:00+08',
    '2026-06-30 18:00:00+08'
  ),
  (
    '70000000-0000-4000-8000-000000000007',
    'demo-dodo-adopter-update',
    'rescue_story',
    '【示範】豆豆新生活更新',
    '領養後第一週回報',
    '豆豆已完成領養程序，領養人回報牠食慾正常，正逐步適應新家。',
    '豆豆到新家後第一週表現穩定，願意在固定位置休息，也開始跟隨領養人散步。職員已整理更新草稿，供領養人確認後作後續通知示範。',
    null,
    'published',
    '2026-07-06 12:00:00+08',
    '了解成功領養',
    '/report/adoption',
    '豆豆新生活更新 · HKSCDA 救援故事',
    '豆豆完成領養後第一週狀態穩定。',
    '豆豆新生活更新',
    '領養後第一週回報。',
    '2026-07-06 12:00:00+08',
    '2026-07-06 12:00:00+08'
  )
on conflict (id) do update
set slug = excluded.slug,
    type = excluded.type,
    title = excluded.title,
    subtitle = excluded.subtitle,
    summary = excluded.summary,
    body = excluded.body,
    cover_media_id = excluded.cover_media_id,
    status = excluded.status,
    published_at = excluded.published_at,
    cta_label = excluded.cta_label,
    cta_url = excluded.cta_url,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    og_title = excluded.og_title,
    og_description = excluded.og_description,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.rescue_story_profile
  (content_item_id, animal_type, public_status, rescue_region, rescue_date, show_on_map, public_map_label, public_lat, public_lng, internal_address, internal_location_notes, is_featured, created_at, updated_at)
values
  ('70000000-0000-4000-8000-000000000001', 'cat', 'medical_care', '深水埗', '2026-06-28', true, '深水埗公開救援區域', 22.330200, 114.162200, null, null, true, '2026-07-05 09:00:00+08', '2026-07-06 20:00:00+08'),
  ('70000000-0000-4000-8000-000000000002', 'dog', 'ready_for_adoption', '元朗', '2026-06-20', true, '元朗公開救援區域', 22.445600, 114.022900, null, null, true, '2026-07-04 10:00:00+08', '2026-07-04 18:00:00+08'),
  ('70000000-0000-4000-8000-000000000003', 'cat', 'sponsor_needed', '觀塘', '2026-06-12', true, '觀塘公開救援區域', 22.313300, 114.225200, null, null, false, '2026-07-03 14:00:00+08', '2026-07-03 16:00:00+08'),
  ('70000000-0000-4000-8000-000000000007', 'dog', 'adopted', '沙田', '2026-06-01', true, '沙田公開領養更新', 22.382300, 114.191900, null, null, true, '2026-07-06 12:00:00+08', '2026-07-06 12:00:00+08')
on conflict (content_item_id) do update
set animal_type = excluded.animal_type,
    public_status = excluded.public_status,
    rescue_region = excluded.rescue_region,
    rescue_date = excluded.rescue_date,
    show_on_map = excluded.show_on_map,
    public_map_label = excluded.public_map_label,
    public_lat = excluded.public_lat,
    public_lng = excluded.public_lng,
    internal_address = excluded.internal_address,
    internal_location_notes = excluded.internal_location_notes,
    is_featured = excluded.is_featured,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.content_link
  (id, content_item_id, linked_type, linked_id, relationship, created_at, updated_at)
values
  ('74000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'animal', '10000000-0000-4000-8000-000000000001', 'primary_subject', '2026-07-05 09:00:00+08', '2026-07-05 09:00:00+08'),
  ('74000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'animal', '10000000-0000-4000-8000-000000000004', 'primary_subject', '2026-07-04 10:00:00+08', '2026-07-04 10:00:00+08'),
  ('74000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'animal', '10000000-0000-4000-8000-000000000006', 'primary_subject', '2026-07-03 14:00:00+08', '2026-07-03 14:00:00+08'),
  ('74000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000007', 'animal', '10000000-0000-4000-8000-000000000005', 'primary_subject', '2026-07-06 12:00:00+08', '2026-07-06 12:00:00+08'),
  ('74000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000007', 'successful_adoption', '54000000-0000-4000-8000-000000000001', 'related_case', '2026-07-06 12:00:00+08', '2026-07-06 12:00:00+08'),
  ('74000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000007', 'supporter', '30000000-0000-4000-8000-000000000002', 'adopter', '2026-07-06 12:00:00+08', '2026-07-06 12:00:00+08')
on conflict (content_item_id, linked_type, linked_id, relationship) do update
set created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.story_update
  (id, content_item_id, kind, title, body, occurred_at, visibility, should_generate_adopter_drafts, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'medical', '已完成疫苗接種', '小白已完成第一針疫苗，現於暫養家庭康復中，食慾和精神均有改善。', '2026-07-05 10:00:00+08', 'public', true, '2026-07-05 10:00:00+08', '2026-07-05 10:00:00+08'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'foster', '暫養家庭回報穩定', '暫養家庭表示小白開始主動探索房間，亦願意接受輕柔撫摸。', '2026-07-06 20:00:00+08', 'public', false, '2026-07-06 20:00:00+08', '2026-07-06 20:00:00+08'),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', 'care', '散步訓練有進展', 'Lucky 能完成短距離散步，對路面聲音的反應明顯放鬆。', '2026-07-04 18:00:00+08', 'public', false, '2026-07-04 18:00:00+08', '2026-07-04 18:00:00+08'),
  ('71000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000003', 'medical', '覆診及藥物跟進', '阿橘需要定期覆診和慢性病藥物，義工正記錄每日食慾及體重。', '2026-07-03 16:00:00+08', 'public', true, '2026-07-03 16:00:00+08', '2026-07-03 16:00:00+08'),
  ('71000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000007', 'adoption', '領養人回報適應良好', '豆豆到新家後第一週表現穩定，已建立散步和進食時間表。', '2026-07-06 12:30:00+08', 'public', true, '2026-07-06 12:30:00+08', '2026-07-06 12:30:00+08'),
  ('71000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000007', 'general', '內部備註：下一次回訪', '此為內部示範更新，不會在公開故事頁顯示。', '2026-07-06 13:00:00+08', 'internal', false, '2026-07-06 13:00:00+08', '2026-07-06 13:00:00+08')
on conflict (id) do update
set content_item_id = excluded.content_item_id,
    kind = excluded.kind,
    title = excluded.title,
    body = excluded.body,
    occurred_at = excluded.occurred_at,
    visibility = excluded.visibility,
    should_generate_adopter_drafts = excluded.should_generate_adopter_drafts,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.social_copy_variant
  (id, content_item_id, story_update_id, platform, language, copy_text, hashtags, status, created_at, updated_at)
values
  ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'facebook', 'zh-HK', '【示範草稿】小白已完成疫苗接種，現於暫養家庭康復中。謝謝每位支持醫療基金的朋友。', array['HKSCDA','救援故事','支持領養'], 'draft', '2026-07-05 10:05:00+08', '2026-07-05 10:05:00+08'),
  ('72000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'instagram', 'zh-HK', '【示範草稿】小白向大家報平安。完成疫苗後，牠正慢慢恢復精神。', array['HKSCDA','RescueStory','AdoptDontShop'], 'draft', '2026-07-05 10:05:00+08', '2026-07-05 10:05:00+08'),
  ('72000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'whatsapp', 'zh-HK', '【示範草稿】小白已完成疫苗接種，現於暫養家庭康復中。', array[]::text[], 'draft', '2026-07-05 10:05:00+08', '2026-07-05 10:05:00+08'),
  ('72000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000007', '71000000-0000-4000-8000-000000000005', 'facebook', 'zh-HK', '【示範草稿】豆豆完成領養後第一週適應良好，領養人回報牠已建立穩定作息。', array['HKSCDA','成功領養','領養更新'], 'draft', '2026-07-06 12:35:00+08', '2026-07-06 12:35:00+08'),
  ('72000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000007', '71000000-0000-4000-8000-000000000005', 'whatsapp', 'zh-HK', '【示範草稿】豆豆新生活第一週適應良好，謝謝領養人持續回報。', array[]::text[], 'draft', '2026-07-06 12:35:00+08', '2026-07-06 12:35:00+08')
on conflict (id) do update
set content_item_id = excluded.content_item_id,
    story_update_id = excluded.story_update_id,
    platform = excluded.platform,
    language = excluded.language,
    copy_text = excluded.copy_text,
    hashtags = excluded.hashtags,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.recipient_notification_draft
  (id, story_update_id, content_item_id, adoption_case_id, supporter_id, channel, recipient_name, recipient_contact, subject, body, status, created_at, updated_at)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000005',
    '70000000-0000-4000-8000-000000000007',
    '51000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000002',
    'whatsapp',
    '李家豪',
    '9123 1002',
    null,
    '【示範領養人更新草稿】豆豆完成領養後第一週適應良好。職員確認內容後，可手動傳送給領養人作後續紀錄。',
    'draft',
    '2026-07-06 12:40:00+08',
    '2026-07-06 12:40:00+08'
  )
on conflict (id) do update
set story_update_id = excluded.story_update_id,
    content_item_id = excluded.content_item_id,
    adoption_case_id = excluded.adoption_case_id,
    supporter_id = excluded.supporter_id,
    channel = excluded.channel,
    recipient_name = excluded.recipient_name,
    recipient_contact = excluded.recipient_contact,
    subject = excluded.subject,
    body = excluded.body,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.audit_log
  (id, actor_user_id, action, entity, entity_id, timestamp, detail, created_at, updated_at)
values
  ('90000000-0000-4000-8000-000000000001', null, 'coordinator_export.cases', 'coordinator_export', 'demo-export-cases', '2026-06-29 17:00:00+08', '{"kind":"cases","rowCount":5,"sourceRoute":"/api/admin/adoptions/exports/cases.csv","filters":{"demo":true}}'::jsonb, '2026-06-29 17:00:00+08', '2026-06-29 17:00:00+08'),
  ('90000000-0000-4000-8000-000000000002', null, 'coordinator_export.adopters', 'coordinator_export', 'demo-export-adopters', '2026-06-29 17:05:00+08', '{"kind":"adopters","rowCount":4,"sourceRoute":"/api/admin/adoptions/exports/adopters.csv","filters":{"demo":true}}'::jsonb, '2026-06-29 17:05:00+08', '2026-06-29 17:05:00+08'),
  ('90000000-0000-4000-8000-000000000003', null, 'coordinator_export.tasks', 'coordinator_export', 'demo-export-tasks', '2026-06-29 17:10:00+08', '{"kind":"tasks","rowCount":5,"sourceRoute":"/api/admin/adoptions/exports/tasks.csv","filters":{"demo":true}}'::jsonb, '2026-06-29 17:10:00+08', '2026-06-29 17:10:00+08')
on conflict (id) do update
set actor_user_id = excluded.actor_user_id,
    action = excluded.action,
    entity = excluded.entity,
    entity_id = excluded.entity_id,
    timestamp = excluded.timestamp,
    detail = excluded.detail,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

commit;
