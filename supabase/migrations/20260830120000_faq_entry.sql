create table if not exists public.faq_entry (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('sponsorship', 'adoption', 'tax_receipt', 'donation', 'contact')),
  question_zh text not null check (char_length(question_zh) between 1 and 300),
  question_en text not null check (char_length(question_en) between 1 and 300),
  answer_zh text not null check (char_length(answer_zh) between 1 and 4000),
  answer_en text not null check (char_length(answer_en) between 1 and 4000),
  keywords_zh text[] not null default '{}',
  keywords_en text[] not null default '{}',
  cta_key text,
  sensitive boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_entry_public_idx
  on public.faq_entry (category, is_active, sort_order);

alter table public.faq_entry enable row level security;

grant select, insert, update, delete on public.faq_entry to service_role;

revoke all on public.faq_entry from anon, authenticated;

drop trigger if exists set_updated_at on public.faq_entry;
create trigger set_updated_at before update on public.faq_entry
  for each row execute function public.set_updated_at();

create or replace function public.upsert_faq_entry_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_category text,
  p_question_zh text,
  p_question_en text,
  p_answer_zh text,
  p_answer_en text,
  p_keywords_zh text[],
  p_keywords_en text[],
  p_cta_key text,
  p_sensitive boolean,
  p_sort_order integer
)
returns public.faq_entry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  result public.faq_entry;
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
    insert into public.faq_entry (
      category, question_zh, question_en, answer_zh, answer_en,
      keywords_zh, keywords_en, cta_key, sensitive, sort_order,
      created_by, updated_by
    ) values (
      p_category, p_question_zh, p_question_en, p_answer_zh, p_answer_en,
      p_keywords_zh, p_keywords_en, p_cta_key, p_sensitive, p_sort_order,
      actor.id, actor.id
    )
    returning * into result;
  else
    update public.faq_entry set
      category = p_category,
      question_zh = p_question_zh,
      question_en = p_question_en,
      answer_zh = p_answer_zh,
      answer_en = p_answer_en,
      keywords_zh = p_keywords_zh,
      keywords_en = p_keywords_en,
      cta_key = p_cta_key,
      sensitive = p_sensitive,
      sort_order = p_sort_order,
      updated_by = actor.id
    where id = p_id
    returning * into result;

    if not found then
      raise exception 'FAQ entry not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when p_id is null then 'faq_entry.create' else 'faq_entry.update' end,
    'faq_entry',
    result.id::text,
    jsonb_build_object('category', p_category, 'sensitive', p_sensitive)
  );

  return result;
end;
$$;

revoke all on function public.upsert_faq_entry_with_audit(
  uuid, uuid, text, text, text, text, text, text[], text[], text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.upsert_faq_entry_with_audit(
  uuid, uuid, text, text, text, text, text, text[], text[], text, boolean, integer
) to service_role;

create or replace function public.deactivate_faq_entry_with_audit(
  p_actor_user_id uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  update public.faq_entry set is_active = false where id = p_id;

  if not found then
    raise exception 'FAQ entry not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, 'faq_entry.deactivate', 'faq_entry', p_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.deactivate_faq_entry_with_audit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.deactivate_faq_entry_with_audit(uuid, uuid) to service_role;

insert into public.faq_entry (
  category, question_zh, question_en, answer_zh, answer_en,
  keywords_zh, keywords_en, cta_key, sensitive, sort_order
) values
(
  'sponsorship',
  '助養運作方式是什麼？',
  'How does sponsorship work?',
  '助養是每月為指定動物提供食物、醫療和日常照顧的長期支持。你可選擇要支持的動物以及每月金額，工作人員會在提交後跟進付款及確認。',
  E'Sponsorship is monthly support for an animal''s food, medical care, and daily needs. You can choose preferred sponsor animals and a monthly amount, then staff will follow up on payment and confirmation.',
  array['助養', '動物', '月費', '食物', '醫療', '照顧'],
  array['sponsor', 'sponsorship', 'monthly', 'support', 'animal', 'pledge'],
  'view_sponsor_animals', false, 0
),
(
  'sponsorship',
  '我想開始助養，下一步要怎麼做？',
  'I want to start sponsoring. What should I do next?',
  '先選擇你想支持的動物，然後前往助養表格完成申請。你可以選擇每月 HK$100、HK$300、HK$500 或自訂金額；提交後會收到參考編號，職員會跟進確認付款安排。',
  'Choose your preferred sponsor animals first, then continue to the sponsorship form. You can select HK$100, HK$300, HK$500, or a custom monthly amount. After submission, you will receive a reference and staff will confirm the payment arrangement.',
  array['助養', '開始', '申請', '動物', '每月', '繳費'],
  array['start sponsorship', 'pledge form', 'payment proof', 'reference', 'HK$100', 'HK$300', 'HK$500'],
  'start_sponsorship_pledge', false, 1
),
(
  'adoption',
  '我要怎樣申請領養？',
  'How do I apply to adopt a cat or dog?',
  '你可先查看可領養動物並加入預備名單，接著提交領養申請。表格會詢問住家環境、家庭狀況、照顧經驗、探訪安排及照片，讓義工判斷合適配對。',
  'Browse adoptable animals, add them to your adoption shortlist, then submit an adoption application. The form asks about your home, household, care experience, visit preferences, and photos so volunteers can assess a suitable match.',
  array['領養', '申請', '動物', '家庭', '照顧', '申請表'],
  array['adopt', 'adoption', 'apply', 'cat', 'dog', 'shortlist', 'application'],
  'start_adoption_application', false, 0
),
(
  'adoption',
  '領養前我需要準備什麼？',
  'What should I prepare before adopting?',
  '請先準備住家安全資料，例如窗戶、門鎖狀況，居家照片，是否有其他寵物，家庭同意書，日常照顧安排及照顧預算。工作人員會按每隻動物需求作進一步跟進。',
  E'Prepare information about home safety, such as windows and doors, photos of the living environment, current pets, household agreement, daily care arrangements, and care budget. Staff will follow up based on each animal''s needs.',
  array['準備', '領養', '住家', '安全', '照片', '照顧'],
  array['prepare', 'home safety', 'windows', 'photos', 'visit', 'care'],
  'browse_adoption_animals', false, 1
),
(
  'tax_receipt',
  '我可以為捐款申請報稅收據嗎？',
  'Can I request a tax receipt for my donation?',
  'HKSCDA 是持牌慈善機構。一般來說，捐款金額在 HK$100 或以上即可申請報稅收據。此助理只會提供收據流程，不能提供個人稅務意見。',
  'HKSCDA is an approved charitable institution. In general, donations of HK$100 or above can request an IRD Section 88 charitable donation receipt through the receipt process. This help assistant only explains the receipt process and cannot provide personal tax advice.',
  array['報稅', '捐款', '收據', 'IRD', '88條', '申請', '條件'],
  array['tax', 'receipt', 'IRD', 'Section 88', 'charity', 'HK$100', 'deduction'],
  'open_donation_for_receipt', true, 0
),
(
  'tax_receipt',
  '我已完成捐款，如何申請收據？',
  'I already donated. How can I request a receipt?',
  '如果你已完成捐款並需要收據，請使用捐款頁面或直接聯絡職員並提供相關資料。請勿在助理中輸入付款編號、電話、地址或個人資料；請透過官方表單或職員渠道處理。',
  'If you have completed a donation and need a receipt, use the donation page or contact staff with the required details. Please do not enter payment references, phone numbers, addresses, or personal details into this help assistant; use the official form or staff-provided channel instead.',
  array['申請', '已捐款', '付款', '參考編號', '聯絡職員', '收據'],
  array['request receipt', 'already donated', 'payment', 'reference', 'staff', 'receipt'],
  'contact_for_receipt', true, 1
),
(
  'donation',
  '有哪些捐款方式？',
  'What donation methods are available?',
  '捐款頁只會在付款服務完成正式啟用審批後顯示可用方式。如頁面顯示尚未啟用，請先聯絡職員核實安排，切勿使用測試或未經確認的付款資料。',
  'The donation page shows payment methods only after production activation is approved. If the page says online donations are not active, contact staff to verify an arrangement and do not use test or unconfirmed payment details.',
  array['捐款', 'FPS', 'PayMe', 'PayPal', '刷卡', '支付'],
  array['donate', 'FPS', 'PayMe', 'PayPal', 'card', 'Alipay', 'method'],
  'view_donation_methods', false, 0
),
(
  'donation',
  '捐款會用在那些地方？',
  'What will my donation support?',
  '捐款可用於動物食品、醫療、絕育、救援、安置及日常照顧。有些捐款可指定用途，例如一般支持、醫療照顧或助養相關支持。',
  'Donations support food, medical care, desexing, rescue, adoption matching, and daily care. You can choose a purpose such as general support, medical care, or sponsorship-related support when donating.',
  array['捐款', '用途', '醫療', '食物', '絕育', '救援', '照顧'],
  array['purpose', 'medical', 'food', 'desexing', 'rescue', 'sponsor'],
  'donation_purpose_cta', false, 1
),
(
  'contact',
  '如何聯絡職員？',
  'How can I contact staff?',
  '可透過 WhatsApp／電話 9864 1089 或電郵 info@hkscda.com 聯絡。若涉及個人資料、付款、收據或申請進度，請直接聯絡職員。',
  'You can contact HKSCDA by WhatsApp / phone at 9864 1089 or email info@hkscda.com. For personal data, payment, receipt, or application-status questions, please contact staff directly.',
  array['聯絡職員', 'WhatsApp', '電話', '電郵', '查詢', '支援'],
  array['contact', 'WhatsApp', 'phone', 'email', 'staff', 'enquiry'],
  'open_contact_section', false, 0
),
(
  'contact',
  '可以在助理裡輸入個人資料嗎？',
  'Can I enter personal details in the help assistant?',
  '請勿在這個助理輸入姓名、電話、地址、付款參考、申請答案或上傳檔案明細。此服務只用作查詢常見問題與下一步連結，個人案件請使用官方表單或直接聯絡職員。',
  'Please do not enter names, phone numbers, addresses, payment references, application answers, or uploaded-file details into this help assistant. It is only for finding FAQs and next-step links; use official forms or contact staff for personal cases.',
  array['個人資料', '隱私', '電話', '地址', '付款', '申請'],
  array['privacy', 'personal data', 'phone', 'address', 'payment reference', 'application'],
  'contact_for_private_case', true, 1
);
