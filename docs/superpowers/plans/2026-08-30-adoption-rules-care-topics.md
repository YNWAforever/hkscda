# Adoption Rules & Care Topics CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `/adoption/instructions`'s hardcoded, zh-HK-only `adoptionRules`/`catCareTopics`/`dogCareTopics` constants into the existing `adoptionInformation` domain as two new admin-manageable, bilingual resources (`rules`, `careTopics`), and add a language toggle to the public page so the new English content is actually visible.

**Architecture:** Extend `src/lib/adoptionInformation/` (types → schemas → repository → service → http → publicPage.server) with two new resource types, following the domain's existing per-resource-method pattern exactly. Two new admin components (`AdoptionRulesManagement.tsx`, `CareTopicsManagement.tsx`) are added as self-contained siblings to the existing `AdoptionInformationManagement.tsx`, sharing a small extracted tab-bar component. New mutations use the atomic `*_with_audit` RPC pattern (unlike the domain's existing, pre-dating, non-atomic fee/estate audit calls, which this work does not touch). No new admin route, nav item, or access area is needed — `/admin/content/adoption` and the `contentManagement` access area already gate this exact page.

**Tech Stack:** TanStack Start (SSR React 19 + TanStack Router + Vite + Nitro), Supabase Postgres with RLS, Bun test runner, Zod validation, `@tanstack/react-query`.

**Reference spec:** `docs/superpowers/specs/2026-08-30-adoption-rules-care-topics-design.md`

---

### Task 1: Migration — `adoption_rules` and `care_topics` tables, RPCs, and seed data

**Files:**
- Create: `supabase/migrations/20260830130000_adoption_rules_care_topics.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260830130000_adoption_rules_care_topics.sql`:

```sql
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
 E'Cats six months or older are considered adults. Vaccinate and have a health check every year. Deworm regularly (internal and external parasites). Watch your cat\'s eating and toileting habits, and see a vet promptly if anything seems unusual.', 4),
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
 E'Provide quality dog food suited to your dog\'s size and age. Always have fresh water available. Avoid onion, garlic, chocolate, grapes, and overly salty food.', 2),
('dog', '休息', 'Rest',
 '為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。',
 'Give your dog a fixed resting spot. Puppies need more sleep each day — avoid disturbing them too much.', 3),
('dog', '清潔', 'Cleaning',
 '定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。',
 'Bathe and groom regularly. Clean ears and trim nails regularly. Train your dog to relieve itself in a designated spot.', 4),
('dog', '保健', 'Health',
 '每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。',
 E'Vaccinate and deworm every year. Have regular veterinary checks. Watch for changes in your dog\'s eating and behaviour.', 5),
('dog', '溜狗', 'Walk',
 '每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。',
 E'Walk your dog daily to provide adequate exercise. Always use a leash and dog tag outdoors. Only let your dog off-leash where it\'s permitted.', 6),
('dog', '教育', 'Training',
 '盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。',
 'Start basic obedience training early — sit, stay, recall, etc. Use positive reinforcement and avoid physical punishment. Seek help from a professional trainer for behavioural issues.', 7)
on conflict (animal_type, sort_order) do update set
  label_zh = excluded.label_zh,
  label_en = excluded.label_en,
  content_zh = excluded.content_zh,
  content_en = excluded.content_en,
  updated_at = now();
```

Note: entries containing a literal apostrophe in the English text (e.g. `page's`, `landlord's`, `association's`, `animal's`, `cat's`, `dog's`, `it's`) use the `E'...'` escaped-string form with `''` for the embedded apostrophe, matching the convention already used in `20260830120000_faq_entry.sql`.

- [ ] **Step 2: Write the migration-safety test**

In `src/lib/supabaseMigrations.test.ts`, add (following the existing `faq_entry` test immediately above as the pattern):

```ts
  test("adoption_rules/care_topics: RLS locked down, animal_type constrained, both audit RPCs present and locked to service_role", () => {
    const sql = readMigrationBySuffix("_adoption_rules_care_topics.sql");

    expect(sql).toContain("create table if not exists public.adoption_rules");
    expect(sql).toContain("create table if not exists public.care_topics");
    expect(sql).toContain("animal_type text not null check (animal_type in ('dog', 'cat'))");
    expect(sql).toContain("alter table public.adoption_rules enable row level security");
    expect(sql).toContain("alter table public.care_topics enable row level security");
    expect(sql).toContain(
      "grant select, insert, update, delete on public.adoption_rules to service_role",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on public.care_topics to service_role",
    );
    expect(sql).toContain("revoke all on public.adoption_rules from anon, authenticated");
    expect(sql).toContain("revoke all on public.care_topics from anon, authenticated");

    for (const fn of ["upsert_adoption_rule_with_audit", "upsert_care_topic_with_audit"]) {
      expect(sql).toContain(`create or replace function public.${fn}(`);
    }

    const guards = sql.match(
      /from public\.admin_user\s*\n\s*where auth_user_id = p_actor_user_id\s*\n\s*and status = 'active'\s*\n\s*and role in \('staff', 'admin'\)/g,
    );
    expect(guards).toHaveLength(2);

    expect(sql).toMatch(
      /revoke all on function public\.upsert_adoption_rule_with_audit\([\s\S]*?\) from public, anon, authenticated;\s*\ngrant execute on function public\.upsert_adoption_rule_with_audit\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.upsert_care_topic_with_audit\([\s\S]*?\) from public, anon, authenticated;\s*\ngrant execute on function public\.upsert_care_topic_with_audit\([\s\S]*?\) to service_role;/,
    );

    // Both RPCs write exactly one audit_log row inside the same function body
    // as the data mutation (atomic — never a second, separately-failable call).
    expect((sql.match(/insert into public\.audit_log/g) ?? []).length).toBe(2);

    // 1 inside each RPC's create branch, plus the seed bulk-inserts.
    expect((sql.match(/insert into public\.adoption_rules/g) ?? []).length).toBe(2);
    expect((sql.match(/insert into public\.care_topics/g) ?? []).length).toBe(2);
    expect((sql.match(/'cat', '/g) ?? []).length).toBe(7);
    // 8 dog seed rows + 1 incidental match from the
    // "animal_type in ('dog', 'cat')" check constraint's own text.
    expect((sql.match(/'dog', '/g) ?? []).length).toBe(9);
  });
```

- [ ] **Step 3: Run the test**

```bash
bun test src/lib/supabaseMigrations.test.ts 2>&1 | tail -15
```

Expected: PASS. If the `insert into public.adoption_rules` count doesn't match 2, check whether the RPC's create branch and the seed block both use the fully-qualified `public.adoption_rules` table name (they must — an unqualified `adoption_rules` would fail the count assertion and would also violate this repo's `search_path = public, pg_temp` convention for `security definer` functions).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830130000_adoption_rules_care_topics.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add adoption_rules and care_topics migration with atomic audit RPCs and seed data"
```

---

### Task 2: `adoptionInformation` types and schemas for the two new resources

**Files:**
- Modify: `src/lib/adoptionInformation/types.ts`
- Modify: `src/lib/adoptionInformation/schemas.ts`
- Test: `src/lib/adoptionInformation/schemas.test.ts`

- [ ] **Step 1: Extend `types.ts`**

The current file is:

```ts
export type AdoptionAnimalType = "dog" | "cat";
export type AdoptionInformationResource = "fees" | "estates";

export type AdoptionFee = {
  id: string;
  animalType: AdoptionAnimalType;
  itemName: string;
  priceHkd: string;
  sortOrder: number;
  isPublished: boolean;
};

export type DogFriendlyEstate = {
  id: string;
  estateName: string;
  district: string;
  notes: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type PublicAdoptionInformation = {
  fees: AdoptionFee[];
  estates: DogFriendlyEstate[];
};

export type AdminAdoptionInformationQuery = {
  resource: AdoptionInformationResource;
  q?: string;
  animalType?: AdoptionAnimalType;
  page: number;
  pageSize: number;
};

export type AdminAdoptionInformationPage = {
  resource: AdoptionInformationResource;
  items: Array<AdoptionFee | DogFriendlyEstate>;
  total: number;
  page: number;
  pageSize: number;
};
```

Replace it with:

```ts
export type AdoptionAnimalType = "dog" | "cat";
export type AdoptionInformationResource = "fees" | "estates" | "rules" | "careTopics";

export type AdoptionLanguage = "zh-HK" | "en";
export type BilingualText = Record<AdoptionLanguage, string>;

export type AdoptionFee = {
  id: string;
  animalType: AdoptionAnimalType;
  itemName: string;
  priceHkd: string;
  sortOrder: number;
  isPublished: boolean;
};

export type DogFriendlyEstate = {
  id: string;
  estateName: string;
  district: string;
  notes: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type AdoptionRuleContent = {
  id: string;
  content: BilingualText;
  sortOrder: number;
  isPublished: boolean;
};

export type CareTopic = {
  id: string;
  animalType: AdoptionAnimalType;
  label: BilingualText;
  content: BilingualText;
  sortOrder: number;
  isPublished: boolean;
};

export type PublicAdoptionInformation = {
  fees: AdoptionFee[];
  estates: DogFriendlyEstate[];
  rules: AdoptionRuleContent[];
  careTopics: CareTopic[];
};

export type AdminAdoptionInformationQuery = {
  resource: AdoptionInformationResource;
  q?: string;
  animalType?: AdoptionAnimalType;
  page: number;
  pageSize: number;
};

export type AdminAdoptionInformationPage = {
  resource: AdoptionInformationResource;
  items: Array<AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic>;
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 2: Extend `schemas.ts`**

The current file is:

```ts
import { z } from "zod";

const optionalId = z.string().uuid().optional();
const sortOrder = z.coerce.number().int().min(0);
const optionalNotes = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

export const adoptionInformationIdSchema = z.string().uuid();
export const adoptionFeeInputSchema = z.object({
  id: optionalId,
  animalType: z.enum(["dog", "cat"]),
  itemName: z.string().trim().min(1).max(180),
  priceHkd: z.string().trim().min(1).max(40),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const estateInputSchema = z.object({
  id: optionalId,
  estateName: z.string().trim().min(1).max(180),
  district: z.string().trim().min(1).max(120),
  notes: optionalNotes,
  sortOrder,
  isPublished: z.boolean().default(false),
});

export const adminAdoptionInformationQuerySchema = z.object({
  resource: z.enum(["fees", "estates"]).catch("fees"),
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  animalType: z.enum(["dog", "cat"]).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(25)
    .transform((value) => Math.min(value, 50)),
});

export const adoptionInformationMutationSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("fee"), input: adoptionFeeInputSchema }),
  z.object({ resource: z.literal("estate"), input: estateInputSchema }),
]);

export const deleteEstateRequestSchema = z.object({ id: adoptionInformationIdSchema });

export type AdoptionFeeInput = z.infer<typeof adoptionFeeInputSchema>;
export type EstateInput = z.infer<typeof estateInputSchema>;
```

Replace it with:

```ts
import { z } from "zod";

const optionalId = z.string().uuid().optional();
const sortOrder = z.coerce.number().int().min(0);
const optionalNotes = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);
const bilingualText = (max: number) =>
  z.object({
    "zh-HK": z.string().trim().min(1).max(max),
    en: z.string().trim().min(1).max(max),
  });

export const adoptionInformationIdSchema = z.string().uuid();
export const adoptionFeeInputSchema = z.object({
  id: optionalId,
  animalType: z.enum(["dog", "cat"]),
  itemName: z.string().trim().min(1).max(180),
  priceHkd: z.string().trim().min(1).max(40),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const estateInputSchema = z.object({
  id: optionalId,
  estateName: z.string().trim().min(1).max(180),
  district: z.string().trim().min(1).max(120),
  notes: optionalNotes,
  sortOrder,
  isPublished: z.boolean().default(false),
});

export const adoptionRuleInputSchema = z.object({
  id: optionalId,
  content: bilingualText(500),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const careTopicInputSchema = z.object({
  id: optionalId,
  animalType: z.enum(["dog", "cat"]),
  label: bilingualText(40),
  content: bilingualText(1000),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const adminAdoptionInformationQuerySchema = z.object({
  resource: z.enum(["fees", "estates", "rules", "careTopics"]).catch("fees"),
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  animalType: z.enum(["dog", "cat"]).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(25)
    .transform((value) => Math.min(value, 50)),
});

export const adoptionInformationMutationSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("fee"), input: adoptionFeeInputSchema }),
  z.object({ resource: z.literal("estate"), input: estateInputSchema }),
  z.object({ resource: z.literal("rule"), input: adoptionRuleInputSchema }),
  z.object({ resource: z.literal("careTopic"), input: careTopicInputSchema }),
]);

export const deleteEstateRequestSchema = z.object({ id: adoptionInformationIdSchema });

export type AdoptionFeeInput = z.infer<typeof adoptionFeeInputSchema>;
export type EstateInput = z.infer<typeof estateInputSchema>;
export type AdoptionRuleInput = z.infer<typeof adoptionRuleInputSchema>;
export type CareTopicInput = z.infer<typeof careTopicInputSchema>;
```

- [ ] **Step 3: Write the failing tests**

Append to `src/lib/adoptionInformation/schemas.test.ts` (read the existing file first to match its exact `describe`/import style, then add):

```ts
describe("adoptionRuleInputSchema", () => {
  test("accepts a valid bilingual rule", () => {
    const result = adoptionRuleInputSchema.parse({
      content: { "zh-HK": "規則內容", en: "Rule content" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(result.content["zh-HK"]).toBe("規則內容");
    expect(result.content.en).toBe("Rule content");
  });

  test("defaults isPublished to true", () => {
    const result = adoptionRuleInputSchema.parse({
      content: { "zh-HK": "a", en: "b" },
      sortOrder: 0,
    });
    expect(result.isPublished).toBe(true);
  });

  test("rejects content over 500 characters", () => {
    expect(() =>
      adoptionRuleInputSchema.parse({
        content: { "zh-HK": "a".repeat(501), en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects a missing English translation", () => {
    expect(() =>
      adoptionRuleInputSchema.parse({
        content: { "zh-HK": "a" },
        sortOrder: 0,
      }),
    ).toThrow();
  });
});

describe("careTopicInputSchema", () => {
  test("accepts a valid bilingual care topic", () => {
    const result = careTopicInputSchema.parse({
      animalType: "cat",
      label: { "zh-HK": "家居", en: "Home" },
      content: { "zh-HK": "內容", en: "Content" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(result.animalType).toBe("cat");
    expect(result.label.en).toBe("Home");
  });

  test("rejects a label over 40 characters", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "dog",
        label: { "zh-HK": "a".repeat(41), en: "b" },
        content: { "zh-HK": "a", en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects content over 1000 characters", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "dog",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "a".repeat(1001), en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects an invalid animalType", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "bird",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "a", en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });
});

describe("adminAdoptionInformationQuerySchema with the new resources", () => {
  test("accepts resource=rules", () => {
    expect(adminAdoptionInformationQuerySchema.parse({ resource: "rules" }).resource).toBe(
      "rules",
    );
  });

  test("accepts resource=careTopics", () => {
    expect(adminAdoptionInformationQuerySchema.parse({ resource: "careTopics" }).resource).toBe(
      "careTopics",
    );
  });
});

describe("adoptionInformationMutationSchema with the new resources", () => {
  test("accepts a rule mutation", () => {
    const parsed = adoptionInformationMutationSchema.parse({
      resource: "rule",
      input: { content: { "zh-HK": "a", en: "b" }, sortOrder: 0 },
    });
    expect(parsed.resource).toBe("rule");
  });

  test("accepts a careTopic mutation", () => {
    const parsed = adoptionInformationMutationSchema.parse({
      resource: "careTopic",
      input: {
        animalType: "cat",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "c", en: "d" },
        sortOrder: 0,
      },
    });
    expect(parsed.resource).toBe("careTopic");
  });
});
```

Also update the top-level import line in the same test file to include the two new schemas (`adoptionRuleInputSchema`, `careTopicInputSchema`) alongside whatever it currently imports.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test src/lib/adoptionInformation/schemas.test.ts src/lib/adoptionInformation 2>&1 | tail -15
```

Expected: PASS, no regressions in the existing fee/estate schema tests.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: errors will surface in `repository.server.ts`/`service.ts`/`http.ts`/`publicPage.server.ts` — these are addressed in Tasks 3-6. Do not treat this as a failure of this task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adoptionInformation/types.ts src/lib/adoptionInformation/schemas.ts src/lib/adoptionInformation/schemas.test.ts
git commit -m "feat: add types and schemas for adoption rules and care topics"
```

---

### Task 3: `adoptionInformation` repository — rules and care topics

**Files:**
- Modify: `src/lib/adoptionInformation/repository.server.ts`
- Test: `src/lib/adoptionInformation/repository.server.test.ts`

- [ ] **Step 1: Update `repository.server.ts`**

Add this import to the top of the file (alongside the existing ones):

```ts
import type { AdoptionRuleInput, CareTopicInput } from "./schemas";
```

And extend the destructured type import from `"./types"` to also bring in `AdoptionRuleContent`, `CareTopic`.

Add these row schemas and column constants near `FEE_COLUMNS`/`ESTATE_COLUMNS`:

```ts
const RULE_COLUMNS = "id,content_zh,content_en,sort_order,is_published";
const CARE_TOPIC_COLUMNS =
  "id,animal_type,label_zh,label_en,content_zh,content_en,sort_order,is_published";

const ruleRowSchema = z.object({
  id: z.string().uuid(),
  content_zh: z.string().min(1),
  content_en: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_published: z.boolean(),
});
const careTopicRowSchema = z.object({
  id: z.string().uuid(),
  animal_type: z.enum(["dog", "cat"]),
  label_zh: z.string().min(1),
  label_en: z.string().min(1),
  content_zh: z.string().min(1),
  content_en: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_published: z.boolean(),
});
```

Add these mapping functions near `mapFee`/`mapEstate`:

```ts
function mapRule(row: Row): AdoptionRuleContent | null {
  const parsed = ruleRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    content: { "zh-HK": parsed.data.content_zh, en: parsed.data.content_en },
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}

function mapCareTopic(row: Row): CareTopic | null {
  const parsed = careTopicRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    animalType: parsed.data.animal_type,
    label: { "zh-HK": parsed.data.label_zh, en: parsed.data.label_en },
    content: { "zh-HK": parsed.data.content_zh, en: parsed.data.content_en },
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}
```

Since the two new mutations go through RPCs (not plain `insert`/`update` like fees/estates), add these RPC-calling functions near the bottom of the factory function, alongside the existing `upsertFee`/`upsertEstate` methods inside the object returned by `createSupabaseAdoptionInformationRepository`:

```ts
    async upsertRule(input: AdoptionRuleInput, actorUserId: string) {
      const { data, error } = await client.rpc("upsert_adoption_rule_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: input.id ?? null,
        p_content_zh: input.content["zh-HK"],
        p_content_en: input.content.en,
        p_sort_order: input.sortOrder,
        p_is_published: input.isPublished,
      });
      if (error) throwRepositoryError(error);
      const mapped = data ? mapRule(data as Row) : null;
      if (!mapped) throw new Error("Invalid adoption rule row");
      return mapped;
    },

    async upsertCareTopic(input: CareTopicInput, actorUserId: string) {
      const { data, error } = await client.rpc("upsert_care_topic_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: input.id ?? null,
        p_animal_type: input.animalType,
        p_label_zh: input.label["zh-HK"],
        p_label_en: input.label.en,
        p_content_zh: input.content["zh-HK"],
        p_content_en: input.content.en,
        p_sort_order: input.sortOrder,
        p_is_published: input.isPublished,
      });
      if (error) throwRepositoryError(error);
      const mapped = data ? mapCareTopic(data as Row) : null;
      if (!mapped) throw new Error("Invalid care topic row");
      return mapped;
    },
```

Extend `listPublic()` to also fetch the two new tables. Change:

```ts
    async listPublic() {
      const [feeResult, estateResult] = await Promise.all([
        client
          .from("adoption_fees")
          .select(FEE_COLUMNS)
          .eq("is_published", true)
          .order("animal_type", { ascending: true })
          .order("sort_order", { ascending: true }),
        client
          .from("dog_friendly_estates")
          .select(ESTATE_COLUMNS)
          .eq("is_published", true)
          .order("sort_order", { ascending: true })
          .order("estate_name", { ascending: true }),
      ]);
      if (feeResult.error) throw feeResult.error;
      if (estateResult.error) throw estateResult.error;
      return {
        fees: ((feeResult.data ?? []) as Row[])
          .map(mapFee)
          .filter((row): row is AdoptionFee => row !== null && row.isPublished),
        estates: ((estateResult.data ?? []) as Row[])
          .map(mapEstate)
          .filter((row): row is DogFriendlyEstate => row !== null && row.isPublished),
      };
    },
```

to:

```ts
    async listPublic() {
      const [feeResult, estateResult, ruleResult, careTopicResult] = await Promise.all([
        client
          .from("adoption_fees")
          .select(FEE_COLUMNS)
          .eq("is_published", true)
          .order("animal_type", { ascending: true })
          .order("sort_order", { ascending: true }),
        client
          .from("dog_friendly_estates")
          .select(ESTATE_COLUMNS)
          .eq("is_published", true)
          .order("sort_order", { ascending: true })
          .order("estate_name", { ascending: true }),
        client
          .from("adoption_rules")
          .select(RULE_COLUMNS)
          .eq("is_published", true)
          .order("sort_order", { ascending: true }),
        client
          .from("care_topics")
          .select(CARE_TOPIC_COLUMNS)
          .eq("is_published", true)
          .order("animal_type", { ascending: true })
          .order("sort_order", { ascending: true }),
      ]);
      if (feeResult.error) throw feeResult.error;
      if (estateResult.error) throw estateResult.error;
      if (ruleResult.error) throw ruleResult.error;
      if (careTopicResult.error) throw careTopicResult.error;
      return {
        fees: ((feeResult.data ?? []) as Row[])
          .map(mapFee)
          .filter((row): row is AdoptionFee => row !== null && row.isPublished),
        estates: ((estateResult.data ?? []) as Row[])
          .map(mapEstate)
          .filter((row): row is DogFriendlyEstate => row !== null && row.isPublished),
        rules: ((ruleResult.data ?? []) as Row[])
          .map(mapRule)
          .filter((row): row is AdoptionRuleContent => row !== null && row.isPublished),
        careTopics: ((careTopicResult.data ?? []) as Row[])
          .map(mapCareTopic)
          .filter((row): row is CareTopic => row !== null && row.isPublished),
      };
    },
```

Extend `listAdmin()` to branch on the two new resource types. Change:

```ts
    async listAdmin(input: AdminAdoptionInformationQuery) {
      const from = (input.page - 1) * input.pageSize;
      const table = input.resource === "fees" ? "adoption_fees" : "dog_friendly_estates";
      const columns = input.resource === "fees" ? FEE_COLUMNS : ESTATE_COLUMNS;
      let query = client
        .from(table)
        .select(columns, { count: "exact" })
        .order("sort_order", { ascending: true });
      query =
        input.resource === "fees"
          ? query.order("animal_type", { ascending: true })
          : query.order("estate_name", { ascending: true });
      query = query.range(from, from + input.pageSize - 1);
      if (input.resource === "fees" && input.animalType)
        query = query.eq("animal_type", input.animalType);
      if (input.q) {
        const like = postgrestLikeOperand(input.q);
        query = query.or(
          input.resource === "fees"
            ? `item_name.ilike.${like},price_hkd.ilike.${like}`
            : `estate_name.ilike.${like},district.ilike.${like},notes.ilike.${like}`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      const items = ((data ?? []) as Row[])
        .map((row) => (input.resource === "fees" ? mapFee(row) : mapEstate(row)))
        .filter((row): row is AdoptionFee | DogFriendlyEstate => row !== null);
      return {
        resource: input.resource,
        items,
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    },
```

to:

```ts
    async listAdmin(input: AdminAdoptionInformationQuery) {
      const from = (input.page - 1) * input.pageSize;
      const TABLE_BY_RESOURCE = {
        fees: "adoption_fees",
        estates: "dog_friendly_estates",
        rules: "adoption_rules",
        careTopics: "care_topics",
      } as const;
      const COLUMNS_BY_RESOURCE = {
        fees: FEE_COLUMNS,
        estates: ESTATE_COLUMNS,
        rules: RULE_COLUMNS,
        careTopics: CARE_TOPIC_COLUMNS,
      } as const;
      const table = TABLE_BY_RESOURCE[input.resource];
      const columns = COLUMNS_BY_RESOURCE[input.resource];
      let query = client
        .from(table)
        .select(columns, { count: "exact" })
        .order("sort_order", { ascending: true });
      query =
        input.resource === "fees" || input.resource === "careTopics"
          ? query.order("animal_type", { ascending: true })
          : input.resource === "estates"
            ? query.order("estate_name", { ascending: true })
            : query;
      query = query.range(from, from + input.pageSize - 1);
      if ((input.resource === "fees" || input.resource === "careTopics") && input.animalType)
        query = query.eq("animal_type", input.animalType);
      if (input.q) {
        const like = postgrestLikeOperand(input.q);
        const orExpr =
          input.resource === "fees"
            ? `item_name.ilike.${like},price_hkd.ilike.${like}`
            : input.resource === "estates"
              ? `estate_name.ilike.${like},district.ilike.${like},notes.ilike.${like}`
              : input.resource === "rules"
                ? `content_zh.ilike.${like},content_en.ilike.${like}`
                : `label_zh.ilike.${like},label_en.ilike.${like},content_zh.ilike.${like},content_en.ilike.${like}`;
        query = query.or(orExpr);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      const MAPPER_BY_RESOURCE = {
        fees: mapFee,
        estates: mapEstate,
        rules: mapRule,
        careTopics: mapCareTopic,
      } as const;
      const mapper = MAPPER_BY_RESOURCE[input.resource];
      const items = ((data ?? []) as Row[])
        .map((row) => mapper(row))
        .filter(
          (row): row is AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic =>
            row !== null,
        );
      return {
        resource: input.resource,
        items,
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    },
```

Also add `upsertRule`/`upsertCareTopic` to the `AdoptionInformationRepository` interface in `service.ts` — covered in Task 4, since that interface lives in `service.ts`, not `repository.server.ts`.

- [ ] **Step 2: Write the failing tests**

Read `src/lib/adoptionInformation/repository.server.test.ts` in full first to match its exact fake-Supabase-client test harness style, then append tests following that same harness pattern for:
- `upsertRule` calling `rpc("upsert_adoption_rule_with_audit", {...})` with the correct snake_case param mapping, and mapping the RPC's returned row back to `AdoptionRuleContent`.
- `upsertCareTopic` calling `rpc("upsert_care_topic_with_audit", {...})` similarly.
- `listPublic()` including `rules`/`careTopics` in its returned shape, filtered to `isPublished` only.
- `listAdmin({resource: "rules", ...})` and `listAdmin({resource: "careTopics", ...})` querying the correct tables/columns.
- A malformed-row silent-drop case for both new resources (a row missing a required field is dropped from the mapped list, not thrown).

Mirror the exact fake-client shape (e.g. a stub `client.rpc` implementation, a stub `client.from(...).select(...).eq(...).order(...)` chain) already used by the existing fee/estate tests in this file — do not invent a different test-double style.

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/adoptionInformation/repository.server.test.ts 2>&1 | tail -20
```

Expected: PASS, including all pre-existing fee/estate tests (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/adoptionInformation/repository.server.ts src/lib/adoptionInformation/repository.server.test.ts
git commit -m "feat: add repository support for adoption rules and care topics"
```

---

### Task 4: `adoptionInformation` service — rules and care topics

**Files:**
- Modify: `src/lib/adoptionInformation/service.ts`
- Test: `src/lib/adoptionInformation/service.test.ts`

- [ ] **Step 1: Update `service.ts`**

Add imports for the new schemas/types:

```ts
import { adoptionRuleInputSchema, careTopicInputSchema } from "./schemas";
import type { AdoptionRuleInput, CareTopicInput } from "./schemas";
import type { AdoptionRuleContent, CareTopic } from "./types";
```

Extend the `AdoptionInformationRepository` interface:

```ts
export interface AdoptionInformationRepository {
  listPublic(): Promise<PublicAdoptionInformation>;
  listAdmin(input: AdminAdoptionInformationQuery): Promise<AdminAdoptionInformationPage>;
  upsertFee(input: AdoptionFeeInput): Promise<AdoptionFee>;
  upsertEstate(input: EstateInput): Promise<DogFriendlyEstate>;
  deleteEstate(id: string): Promise<void>;
  upsertRule(input: AdoptionRuleInput, actorUserId: string): Promise<AdoptionRuleContent>;
  upsertCareTopic(input: CareTopicInput, actorUserId: string): Promise<CareTopic>;
  insertAuditLog(input: AdoptionInformationAuditLog): Promise<void>;
}
```

Add the two new service methods, alongside the existing `upsertFee`/`upsertEstate`/`deleteEstate` methods, inside the object returned by `createAdoptionInformationService`:

```ts
    // upsertRule/upsertCareTopic don't call audit() themselves — unlike
    // upsertFee/upsertEstate above, their underlying RPCs
    // (upsert_adoption_rule_with_audit, upsert_care_topic_with_audit) already
    // insert their audit_log row atomically inside the same transaction as
    // the data change. A second, separate insertAuditLog call here would
    // duplicate that row and reintroduce the exact non-atomic-audit gap this
    // repo's CLAUDE.md warns against for new work.
    async upsertRule({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = adoptionRuleInputSchema.parse(input);
      return repo.upsertRule(parsed, actorUserId);
    },

    async upsertCareTopic({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = careTopicInputSchema.parse(input);
      return repo.upsertCareTopic(parsed, actorUserId);
    },
```

- [ ] **Step 2: Write the failing tests**

Read `src/lib/adoptionInformation/service.test.ts` in full first to match its exact fake-repository style, then append tests for:
- `upsertRule` validates input via the schema then delegates to `repo.upsertRule(parsed, actorUserId)`, returning the repository's result.
- `upsertRule` throws on invalid input (e.g. content over 500 chars) without calling the repository.
- `upsertCareTopic` validates and delegates similarly.
- Neither `upsertRule` nor `upsertCareTopic` calls `repo.insertAuditLog` (assert the fake's audit-log spy was never called for these two operations, confirming no redundant audit call — matching the doc comment above).

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/adoptionInformation/service.test.ts 2>&1 | tail -15
```

Expected: PASS, including all pre-existing fee/estate tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/adoptionInformation/service.ts src/lib/adoptionInformation/service.test.ts
git commit -m "feat: add service support for adoption rules and care topics"
```

---

### Task 5: `adoptionInformation` HTTP handlers — rules and care topics

**Files:**
- Modify: `src/lib/adoptionInformation/http.ts`
- Test: `src/lib/adoptionInformation/http.test.ts` (create if it doesn't already exist; check first)

- [ ] **Step 1: Check whether `http.test.ts` already exists**

```bash
ls src/lib/adoptionInformation/http.test.ts 2>&1
```

If it exists, read it fully and follow its existing style for Step 3 below. If it doesn't exist, Step 3 creates it from scratch, mirroring `src/lib/faq/http.test.ts`'s structure (a fake `service`/`requireAdoptionInformationAdmin`, constructing a `Request`, asserting on the `Response`'s status/JSON body).

- [ ] **Step 2: Update `http.ts`**

Extend the `HandlerService` type:

```ts
type HandlerService = {
  listAdmin(input: unknown): Promise<unknown>;
  upsertFee(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  upsertEstate(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  deleteEstate(input: { actorUserId: string; estateId: string }): Promise<void>;
  upsertRule(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  upsertCareTopic(input: { actorUserId: string; input: unknown }): Promise<unknown>;
};
```

Extend the `upsert` handler's branching. Change:

```ts
    upsert({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        const admin = await requireAdoptionInformationAdmin(request);
        const mutation = adoptionInformationMutationSchema.parse(await jsonBody(request, id));
        if (mutation.resource === "fee") {
          return jsonResponse(
            {
              fee: await service.upsertFee({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        return jsonResponse(
          {
            estate: await service.upsertEstate({
              actorUserId: admin.authUserId,
              input: mutation.input,
            }),
          },
          id,
          { status: 201 },
        );
      });
    },
```

to:

```ts
    upsert({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        const admin = await requireAdoptionInformationAdmin(request);
        const mutation = adoptionInformationMutationSchema.parse(await jsonBody(request, id));
        if (mutation.resource === "fee") {
          return jsonResponse(
            {
              fee: await service.upsertFee({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        if (mutation.resource === "estate") {
          return jsonResponse(
            {
              estate: await service.upsertEstate({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        if (mutation.resource === "rule") {
          return jsonResponse(
            {
              rule: await service.upsertRule({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        return jsonResponse(
          {
            careTopic: await service.upsertCareTopic({
              actorUserId: admin.authUserId,
              input: mutation.input,
            }),
          },
          id,
          { status: 201 },
        );
      });
    },
```

- [ ] **Step 3: Write the failing tests**

Add (or create) `src/lib/adoptionInformation/http.test.ts` covering:
- `upsert` with `{resource: "rule", input: {...}}` returns 201 with `{rule: ...}`, calling `service.upsertRule` with the right `actorUserId`/`input` shape.
- `upsert` with `{resource: "careTopic", input: {...}}` returns 201 with `{careTopic: ...}`.
- Existing `fee`/`estate` behavior is unaffected (if the file already existed, its current tests must still pass unmodified).
- A zod validation error (e.g. missing `content`) returns 400 with an `issues` array, matching the existing `withErrors` error-mapping behavior.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test src/lib/adoptionInformation/http.test.ts 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adoptionInformation/http.ts src/lib/adoptionInformation/http.test.ts
git commit -m "feat: add HTTP handler support for adoption rules and care topics"
```

---

### Task 6: Public read path — extend `PublicAdoptionPageData`

**Files:**
- Modify: `src/lib/adoptionInformation/publicPage.server.ts`
- Test: `src/lib/adoptionInformation/publicPage.server.test.ts`

- [ ] **Step 1: Update `publicPage.server.ts`**

Change the `PublicAdoptionPageData` type from:

```ts
export type PublicAdoptionPageData = {
  feesBySpecies: { dog: AdoptionFee[]; cat: AdoptionFee[] };
  estates: DogFriendlyEstate[];
  guideGroups: PublicAdoptionGuideGroup[];
};
```

to:

```ts
export type PublicAdoptionPageData = {
  feesBySpecies: { dog: AdoptionFee[]; cat: AdoptionFee[] };
  estates: DogFriendlyEstate[];
  guideGroups: PublicAdoptionGuideGroup[];
  rules: AdoptionRuleContent[];
  careTopics: { cat: CareTopic[]; dog: CareTopic[] };
};
```

Add `AdoptionRuleContent`, `CareTopic` to the type-only import from `"./types"` at the top of the file.

Update the return statement inside `createPublicAdoptionPageReader`'s returned async function. Change:

```ts
    return {
      feesBySpecies: {
        dog: fees.filter((fee) => fee.animalType === "dog"),
        cat: fees.filter((fee) => fee.animalType === "cat"),
      },
      estates: information.estates
        .filter((estate) => estate.isPublished)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.estateName.localeCompare(right.estateName, "zh-HK"),
        ),
      guideGroups: guideGroups.length ? guideGroups : legacyGuideGroup ? [legacyGuideGroup] : [],
    };
```

to:

```ts
    const rules = information.rules
      .filter((rule) => rule.isPublished)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const careTopics = information.careTopics
      .filter((topic) => topic.isPublished)
      .sort((left, right) => left.sortOrder - right.sortOrder);

    return {
      feesBySpecies: {
        dog: fees.filter((fee) => fee.animalType === "dog"),
        cat: fees.filter((fee) => fee.animalType === "cat"),
      },
      estates: information.estates
        .filter((estate) => estate.isPublished)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.estateName.localeCompare(right.estateName, "zh-HK"),
        ),
      guideGroups: guideGroups.length ? guideGroups : legacyGuideGroup ? [legacyGuideGroup] : [],
      rules,
      careTopics: {
        cat: careTopics.filter((topic) => topic.animalType === "cat"),
        dog: careTopics.filter((topic) => topic.animalType === "dog"),
      },
    };
```

- [ ] **Step 2: Write the failing test**

Read `src/lib/adoptionInformation/publicPage.server.test.ts` in full first to match its exact fake-repository/fake-guide-loader style, then extend the fake `adoptionRepository.listPublic()` fixture to also return `rules`/`careTopics`, and add assertions that:
- `rules` in the returned `PublicAdoptionPageData` only includes published rules, sorted by `sortOrder`.
- `careTopics.cat`/`careTopics.dog` only include published topics for that species, sorted by `sortOrder`.

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/adoptionInformation/publicPage.server.test.ts 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: clean now that all of `src/lib/adoptionInformation/` is fully updated for the two new resources — this closes out the backend layer entirely.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adoptionInformation/publicPage.server.ts src/lib/adoptionInformation/publicPage.server.test.ts
git commit -m "feat: include adoption rules and care topics in the public adoption page reader"
```

---

### Task 7: Extract a shared `AdoptionContentTabs` component

**Files:**
- Modify: `src/components/admin/content/AdoptionInformationManagement.tsx`
- Modify: `src/components/admin/content/AdoptionInformationManagement.test.tsx`

This is a pure refactor with no behavior change — it prepares the file so Tasks 8-10 can add two more tabs without duplicating the tab-bar JSX three times.

- [ ] **Step 1: Extract the tab bar**

In `src/components/admin/content/AdoptionInformationManagement.tsx`, add this new exported function (place it right after the `AdoptionInformationManagement` function, before `AdoptionInformationManagementRuntime`):

```tsx
export function AdoptionContentTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  return (
    <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
      {(
        [
          ["fees", "領養費用"],
          ["estates", "可養狗屋苑"],
          ["rules", "領養規則"],
          ["careTopics", "動物照顧須知"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={activeTab === value}
          onClick={() => onTabChange(value)}
          className="px-4 py-3 text-sm font-semibold aria-selected:border-b-2 aria-selected:border-[var(--color-primary)] aria-selected:text-[var(--color-primary)]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

Then replace the inline tab bar inside `AdoptionInformationManagementView`. Change:

```tsx
      <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
        {(
          [
            ["fees", "領養費用"],
            ["estates", "可養狗屋苑"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={activeTab === value}
            onClick={() => onTabChange?.(value)}
            className="px-4 py-3 text-sm font-semibold aria-selected:border-b-2 aria-selected:border-[var(--color-primary)] aria-selected:text-[var(--color-primary)]"
          >
            {label}
          </button>
        ))}
      </div>
```

to:

```tsx
      <AdoptionContentTabs activeTab={activeTab} onTabChange={(tab) => onTabChange?.(tab)} />
```

- [ ] **Step 2: Run the existing tests to confirm no regression**

```bash
bun test src/components/admin/content/AdoptionInformationManagement.test.tsx 2>&1 | tail -20
```

Expected: PASS — the rendered markup is unchanged for `activeTab="fees"`/`"estates"` (same two buttons, same labels, same `role="tablist"`/`role="tab"`/`aria-selected` attributes); this is a pure extraction, not a behavior change. If any assertion fails, compare the rendered output character-for-character against the pre-extraction version — the JSX must be identical, only its location moved.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/content/AdoptionInformationManagement.tsx
git commit -m "refactor: extract the shared AdoptionContentTabs component"
```

---

### Task 8: `AdoptionRulesManagement.tsx` admin component

**Files:**
- Create: `src/components/admin/content/AdoptionRulesManagement.tsx`
- Test: `src/components/admin/content/AdoptionRulesManagement.test.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/admin/content/AdoptionRulesManagement.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionInformationResource,
  AdoptionRuleContent,
} from "../../../lib/adoptionInformation/types";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionContentTabs,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

type RuleDraft = {
  id?: string;
  contentZh: string;
  contentEn: string;
  sortOrder: number;
  isPublished: boolean;
};

function draftFromRule(rule?: AdoptionRuleContent): RuleDraft {
  return {
    id: rule?.id,
    contentZh: rule?.content["zh-HK"] ?? "",
    contentEn: rule?.content.en ?? "",
    sortOrder: rule?.sortOrder ?? 0,
    isPublished: rule?.isPublished ?? true,
  };
}

export function toRuleInput(draft: RuleDraft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    content: { "zh-HK": draft.contentZh, en: draft.contentEn },
    sortOrder: draft.sortOrder,
    isPublished: draft.isPublished,
  };
}

export function AdoptionRulesManagement({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  const rulesQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "rules"],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        "/api/admin/adoption-information?resource=rules&page=1&pageSize=50",
      ),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: ReturnType<typeof toRuleInput>) =>
      fetchAdminJson<{ rule: AdoptionRuleContent }>("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({ resource: "rule", input }),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateAdoptionInformationQueries(queryClient);
    },
  });

  const rules = (rulesQuery.data?.items ?? []) as AdoptionRuleContent[];

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">領養</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">領養規則管理</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">領養規則</h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromRule())}
        >
          新增規則
        </button>
      </div>

      {rulesQuery.isLoading ? <p aria-live="polite">載入領養規則中…</p> : null}
      {rulesQuery.isError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          未能載入領養規則，請重新整理頁面。
        </p>
      ) : null}

      {!rulesQuery.isLoading && !rulesQuery.isError ? (
        <ol className="space-y-2">
          {rules
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2"
              >
                <span>
                  {rule.sortOrder + 1}. {rule.content["zh-HK"]}
                  {rule.isPublished ? null : "（已停用）"}
                </span>
                <button type="button" onClick={() => setDraft(draftFromRule(rule))}>
                  編輯
                </button>
              </li>
            ))}
          {rules.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">沒有領養規則資料</p> : null}
        </ol>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border border-[var(--color-border)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toRuleInput(draft));
          }}
        >
          <label className="block">
            規則內容（中文）
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentZh}
              onChange={(event) => setDraft({ ...draft, contentZh: event.target.value })}
              maxLength={500}
              required
            />
          </label>
          <label className="block">
            Rule content (English)
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentEn}
              onChange={(event) => setDraft({ ...draft, contentEn: event.target.value })}
              maxLength={500}
              required
            />
          </label>
          <label className="block max-w-[8rem]">
            排序
            <input
              type="number"
              min={0}
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
            />
            在領養須知頁面顯示
          </label>
          {upsertMutation.isError ? (
            <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
              儲存失敗，請檢查資料後再試一次。
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn-primary min-h-11 px-4"
              disabled={upsertMutation.isPending}
            >
              儲存
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              onClick={() => setDraft(null)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write the test**

Create `src/components/admin/content/AdoptionRulesManagement.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";

import { toRuleInput } from "./AdoptionRulesManagement";

describe("AdoptionRulesManagement", () => {
  describe("toRuleInput", () => {
    test("maps a new draft without an id", () => {
      const input = toRuleInput({
        contentZh: "規則",
        contentEn: "Rule",
        sortOrder: 3,
        isPublished: true,
      });
      expect(input).toEqual({
        content: { "zh-HK": "規則", en: "Rule" },
        sortOrder: 3,
        isPublished: true,
      });
      expect("id" in input).toBe(false);
    });

    test("preserves an existing id when editing", () => {
      const input = toRuleInput({
        id: "11111111-2222-4333-8444-555555555555",
        contentZh: "規則",
        contentEn: "Rule",
        sortOrder: 0,
        isPublished: false,
      });
      expect(input.id).toBe("11111111-2222-4333-8444-555555555555");
      expect(input.isPublished).toBe(false);
    });
  });
});
```

(Following `FaqManagement.tsx`'s precedent, no rendering test is strictly required here — but this domain's OWN existing precedent, `AdoptionInformationManagement.test.tsx`, does render-test its components. If time allows, also add a `renderToStaticMarkup` test asserting the tab bar and rule list render — but the `toRuleInput` unit test above is the minimum bar.)

- [ ] **Step 3: Run the test**

```bash
bun test src/components/admin/content/AdoptionRulesManagement.test.tsx 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/AdoptionRulesManagement.tsx src/components/admin/content/AdoptionRulesManagement.test.tsx
git commit -m "feat: add the adoption rules admin management component"
```

---

### Task 9: `CareTopicsManagement.tsx` admin component

**Files:**
- Create: `src/components/admin/content/CareTopicsManagement.tsx`
- Test: `src/components/admin/content/CareTopicsManagement.test.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/admin/content/CareTopicsManagement.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionAnimalType,
  AdoptionInformationResource,
  CareTopic,
} from "../../../lib/adoptionInformation/types";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionContentTabs,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

type CareTopicDraft = {
  id?: string;
  animalType: AdoptionAnimalType;
  labelZh: string;
  labelEn: string;
  contentZh: string;
  contentEn: string;
  sortOrder: number;
  isPublished: boolean;
};

function draftFromTopic(defaultAnimalType: AdoptionAnimalType, topic?: CareTopic): CareTopicDraft {
  return {
    id: topic?.id,
    animalType: topic?.animalType ?? defaultAnimalType,
    labelZh: topic?.label["zh-HK"] ?? "",
    labelEn: topic?.label.en ?? "",
    contentZh: topic?.content["zh-HK"] ?? "",
    contentEn: topic?.content.en ?? "",
    sortOrder: topic?.sortOrder ?? 0,
    isPublished: topic?.isPublished ?? true,
  };
}

export function toCareTopicInput(draft: CareTopicDraft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    animalType: draft.animalType,
    label: { "zh-HK": draft.labelZh, en: draft.labelEn },
    content: { "zh-HK": draft.contentZh, en: draft.contentEn },
    sortOrder: draft.sortOrder,
    isPublished: draft.isPublished,
  };
}

export function CareTopicsManagement({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  const queryClient = useQueryClient();
  const [species, setSpecies] = useState<AdoptionAnimalType>("cat");
  const [draft, setDraft] = useState<CareTopicDraft | null>(null);

  const topicsQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "careTopics"],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        "/api/admin/adoption-information?resource=careTopics&page=1&pageSize=50",
      ),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: ReturnType<typeof toCareTopicInput>) =>
      fetchAdminJson<{ careTopic: CareTopic }>("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({ resource: "careTopic", input }),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateAdoptionInformationQueries(queryClient);
    },
  });

  const topics = ((topicsQuery.data?.items ?? []) as CareTopic[]).filter(
    (topic) => topic.animalType === species,
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">領養</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">動物照顧須知管理</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex gap-2" role="tablist" aria-label="物種">
        {(["cat", "dog"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={species === value}
            onClick={() => setSpecies(value)}
            className="px-3 py-2 text-sm font-semibold aria-selected:underline"
          >
            {value === "cat" ? "貓隻" : "狗隻"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{species === "cat" ? "養貓需知" : "養狗需知"}</h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromTopic(species))}
        >
          新增主題
        </button>
      </div>

      {topicsQuery.isLoading ? <p aria-live="polite">載入照顧須知中…</p> : null}
      {topicsQuery.isError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          未能載入照顧須知，請重新整理頁面。
        </p>
      ) : null}

      {!topicsQuery.isLoading && !topicsQuery.isError ? (
        <ul className="space-y-2">
          {topics
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((topic) => (
              <li
                key={topic.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2"
              >
                <span>
                  {topic.label["zh-HK"]}
                  {topic.isPublished ? null : "（已停用）"}
                </span>
                <button type="button" onClick={() => setDraft(draftFromTopic(species, topic))}>
                  編輯
                </button>
              </li>
            ))}
          {topics.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">沒有照顧須知資料</p>
          ) : null}
        </ul>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border border-[var(--color-border)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toCareTopicInput(draft));
          }}
        >
          <label className="block">
            物種
            <select
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.animalType}
              onChange={(event) =>
                setDraft({ ...draft, animalType: event.target.value as AdoptionAnimalType })
              }
            >
              <option value="cat">貓隻</option>
              <option value="dog">狗隻</option>
            </select>
          </label>
          <label className="block">
            主題名稱（中文）
            <input
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.labelZh}
              onChange={(event) => setDraft({ ...draft, labelZh: event.target.value })}
              maxLength={40}
              required
            />
          </label>
          <label className="block">
            Topic label (English)
            <input
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.labelEn}
              onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })}
              maxLength={40}
              required
            />
          </label>
          <label className="block">
            內容（中文）
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentZh}
              onChange={(event) => setDraft({ ...draft, contentZh: event.target.value })}
              maxLength={1000}
              required
            />
          </label>
          <label className="block">
            Content (English)
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentEn}
              onChange={(event) => setDraft({ ...draft, contentEn: event.target.value })}
              maxLength={1000}
              required
            />
          </label>
          <label className="block max-w-[8rem]">
            排序
            <input
              type="number"
              min={0}
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
            />
            在領養須知頁面顯示
          </label>
          {upsertMutation.isError ? (
            <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
              儲存失敗，請檢查資料後再試一次。
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn-primary min-h-11 px-4"
              disabled={upsertMutation.isPending}
            >
              儲存
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              onClick={() => setDraft(null)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write the test**

Create `src/components/admin/content/CareTopicsManagement.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";

import { toCareTopicInput } from "./CareTopicsManagement";

describe("CareTopicsManagement", () => {
  describe("toCareTopicInput", () => {
    test("maps a new draft without an id", () => {
      const input = toCareTopicInput({
        animalType: "cat",
        labelZh: "家居",
        labelEn: "Home",
        contentZh: "內容",
        contentEn: "Content",
        sortOrder: 2,
        isPublished: true,
      });
      expect(input).toEqual({
        animalType: "cat",
        label: { "zh-HK": "家居", en: "Home" },
        content: { "zh-HK": "內容", en: "Content" },
        sortOrder: 2,
        isPublished: true,
      });
      expect("id" in input).toBe(false);
    });

    test("preserves an existing id and species when editing", () => {
      const input = toCareTopicInput({
        id: "11111111-2222-4333-8444-555555555555",
        animalType: "dog",
        labelZh: "溜狗",
        labelEn: "Walk",
        contentZh: "內容",
        contentEn: "Content",
        sortOrder: 6,
        isPublished: false,
      });
      expect(input.id).toBe("11111111-2222-4333-8444-555555555555");
      expect(input.animalType).toBe("dog");
      expect(input.isPublished).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run the test**

```bash
bun test src/components/admin/content/CareTopicsManagement.test.tsx 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/CareTopicsManagement.tsx src/components/admin/content/CareTopicsManagement.test.tsx
git commit -m "feat: add the care topics admin management component"
```

---

### Task 10: Wire the two new components into the admin runtime

**Files:**
- Modify: `src/components/admin/content/AdoptionInformationManagement.tsx`
- Modify: `src/components/admin/content/AdoptionInformationManagement.test.tsx`

- [ ] **Step 1: Update `AdoptionInformationManagementRuntime`**

Add the imports at the top of the file:

```tsx
import { AdoptionRulesManagement } from "./AdoptionRulesManagement";
import { CareTopicsManagement } from "./CareTopicsManagement";
```

Inside `AdoptionInformationManagementRuntime`, extract the tab-change handler and branch the return. Change the end of the function from:

```tsx
  return (
    <AdoptionInformationManagementView
      activeTab={activeTab}
      data={informationQuery.data}
      loading={informationQuery.isLoading}
      error={
        (informationQuery.error instanceof Error ? informationQuery.error.message : null) ??
        (mutation.error instanceof Error ? mutation.error.message : null)
      }
      query={query}
      page={page}
      pending={mutation.isPending}
      onTabChange={(tab) => {
        setActiveTab(tab);
        setQuery("");
        setPage(1);
      }}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onPageChange={setPage}
      onSaveFee={(input) => mutation.mutate({ action: "fee", input })}
      onMoveFee={(input, direction) => {
        const updates = moveFeeWithinSpecies(
          informationQuery.data?.items ?? [],
          input.id,
          direction,
        );
        const temporarySortOrder =
          Math.max(
            -1,
            ...(informationQuery.data?.items ?? [])
              .filter(
                (item): item is AdoptionFee => isFee(item) && item.animalType === input.animalType,
              )
              .map((fee) => fee.sortOrder),
          ) + 1;
        if (updates.length)
          mutation.mutate({ action: "move-fees", inputs: updates, temporarySortOrder });
      }}
      onSaveEstate={(input) => mutation.mutate({ action: "estate", input })}
      onDeleteEstate={(id) => {
        // Irreversible and triggered from an inline row button; name the estate
        // so the operator can confirm they hit the row they meant.
        const estate = informationQuery.data?.items.find((item) => item.id === id);
        const label =
          estate && "estateName" in estate ? (estate as { estateName?: string }).estateName : null;
        if (!window.confirm(`確定刪除「${label ?? "此屋苑"}」？此操作無法復原。`)) return;
        mutation.mutate({ action: "delete-estate", id });
      }}
    />
  );
}
```

to:

```tsx
  const handleTabChange = (tab: AdoptionInformationResource) => {
    setActiveTab(tab);
    setQuery("");
    setPage(1);
  };

  if (activeTab === "rules") {
    return <AdoptionRulesManagement activeTab={activeTab} onTabChange={handleTabChange} />;
  }
  if (activeTab === "careTopics") {
    return <CareTopicsManagement activeTab={activeTab} onTabChange={handleTabChange} />;
  }

  return (
    <AdoptionInformationManagementView
      activeTab={activeTab}
      data={informationQuery.data}
      loading={informationQuery.isLoading}
      error={
        (informationQuery.error instanceof Error ? informationQuery.error.message : null) ??
        (mutation.error instanceof Error ? mutation.error.message : null)
      }
      query={query}
      page={page}
      pending={mutation.isPending}
      onTabChange={handleTabChange}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onPageChange={setPage}
      onSaveFee={(input) => mutation.mutate({ action: "fee", input })}
      onMoveFee={(input, direction) => {
        const updates = moveFeeWithinSpecies(
          informationQuery.data?.items ?? [],
          input.id,
          direction,
        );
        const temporarySortOrder =
          Math.max(
            -1,
            ...(informationQuery.data?.items ?? [])
              .filter(
                (item): item is AdoptionFee => isFee(item) && item.animalType === input.animalType,
              )
              .map((fee) => fee.sortOrder),
          ) + 1;
        if (updates.length)
          mutation.mutate({ action: "move-fees", inputs: updates, temporarySortOrder });
      }}
      onSaveEstate={(input) => mutation.mutate({ action: "estate", input })}
      onDeleteEstate={(id) => {
        // Irreversible and triggered from an inline row button; name the estate
        // so the operator can confirm they hit the row they meant.
        const estate = informationQuery.data?.items.find((item) => item.id === id);
        const label =
          estate && "estateName" in estate ? (estate as { estateName?: string }).estateName : null;
        if (!window.confirm(`確定刪除「${label ?? "此屋苑"}」？此操作無法復原。`)) return;
        mutation.mutate({ action: "delete-estate", id });
      }}
    />
  );
}
```

Note this early-returns BEFORE the `informationQuery`/`mutation` hooks would otherwise matter for rules/careTopics — but since `informationQuery`/`mutation` (defined earlier in the function, unchanged) are still called unconditionally on every render regardless of `activeTab` (React's rules of hooks require this), they will harmlessly fetch `resource=rules`-shaped data into a query key `[...ADOPTION_INFORMATION_QUERY_KEY, search]` that only fees/estates ever read from — this is wasted network traffic when switching away from fees/estates, not a correctness bug, since `AdoptionRulesManagement`/`CareTopicsManagement` do their own independent `useQuery` calls with their own distinct query keys. This is an accepted, documented tradeoff, not a defect to fix in this task.

- [ ] **Step 2: Write the failing test**

Read `src/components/admin/content/AdoptionInformationManagement.test.tsx` in full, then add a test confirming the tab bar (now via `AdoptionContentTabs`) includes all 4 tabs even when only the `AdoptionInformationManagement` component's fee/estate view is rendered:

```tsx
  test("renders all four content tabs, including rules and care topics", () => {
    const markup = renderToStaticMarkup(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );
    expect(markup).toContain("領養規則");
    expect(markup).toContain("動物照顧須知");
  });
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/components/admin/content/AdoptionInformationManagement.test.tsx 2>&1 | tail -20
```

Expected: PASS, including all pre-existing tests.

- [ ] **Step 4: Full typecheck and lint**

```bash
bun run typecheck
bun run lint 2>&1 | tail -15
```

Expected: typecheck clean; lint 0 errors (warnings matching the existing baseline are fine — run the FULL `bun run lint`, not a scoped per-file check, since a prior project (FAQ CMS) had a formatting error slip through scoped-only checks).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/AdoptionInformationManagement.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx
git commit -m "feat: wire the rules and care-topics admin components into the tab switcher"
```

---

### Task 11: Public route wiring — language toggle and new content

**Files:**
- Modify: `src/routes/adoption/instructions.tsx`
- Modify: `src/routes/adoption/instructions.test.tsx`

- [ ] **Step 1: Check the existing test file**

```bash
cat src/routes/adoption/instructions.test.tsx
```

Read its exact current assertions in full before proceeding — Step 3 below must not silently drop any existing assertion the current file makes about fees/estates/guide groups; only the rules/care-topics-related assertions (which reference the now-deleted static content) need updating, and new assertions for the language toggle need adding.

- [ ] **Step 2: Update `instructions.tsx`**

Replace the top of the file. Change the import block from:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import * as Tabs from "@radix-ui/react-tabs";
import { SectionHeading } from "../../components/site/SectionHeading";
import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { getPublicAdoptionPage } from "../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../lib/adoptionInformation/publicPage.server";
import { createAdoptionInstructionsLoader } from "../../lib/adoptionInformation/publicPage.loader";
import type { AdoptionFee } from "../../lib/adoptionInformation/types";
```

to:

```tsx
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import * as Tabs from "@radix-ui/react-tabs";
import { SectionHeading } from "../../components/site/SectionHeading";
import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { getPublicAdoptionPage } from "../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../lib/adoptionInformation/publicPage.server";
import { createAdoptionInstructionsLoader } from "../../lib/adoptionInformation/publicPage.loader";
import type { AdoptionFee, AdoptionLanguage } from "../../lib/adoptionInformation/types";
```

Delete the `adoptionRules`, `catCareTopics`, and `dogCareTopics` constants entirely (all three arrays, lines 22-124 in the current file).

Add a `pageCopy` object for the page's static bilingual labels, placed where the deleted constants were:

```tsx
const pageCopy: Record<
  AdoptionLanguage,
  {
    rulesHeading: string;
    catCareHeading: string;
    dogCareHeading: string;
    feesHeading: string;
    feesNote: string;
    dogFeeTitle: string;
    catFeeTitle: string;
    estatesHeading: string;
    estatesNote: string;
    estateNameHeader: string;
    districtHeader: string;
    notesHeader: string;
    estatesEmpty: string;
    contactLink: string;
    guidesHeading: string;
    catGuideTitle: string;
    dogGuideTitle: string;
    generalGuideTitle: string;
    zhVersion: string;
    enVersion: string;
    languageToggleLabel: string;
  }
> = {
  "zh-HK": {
    rulesHeading: "領養規則",
    catCareHeading: "養貓需知",
    dogCareHeading: "養狗需知",
    feesHeading: "領養費用",
    feesNote: "以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。",
    dogFeeTitle: "狗隻領養費用",
    catFeeTitle: "貓隻領養費用",
    estatesHeading: "可養狗屋苑參考名單",
    estatesNote: "以下名單僅供參考，請向屋苑管理處查詢最新規定。",
    estateNameHeader: "屋苑",
    districtHeader: "地區",
    notesHeader: "備註",
    estatesEmpty: "暫時未有屋苑資料。如需最新資訊，請",
    contactLink: "聯絡我們",
    guidesHeading: "領養後指南",
    catGuideTitle: "貓隻領養後指南",
    dogGuideTitle: "狗隻領養後指南",
    generalGuideTitle: "領養後指南",
    zhVersion: "中文版",
    enVersion: "English",
    languageToggleLabel: "語言",
  },
  en: {
    rulesHeading: "Adoption Rules",
    catCareHeading: "Caring for Your Cat",
    dogCareHeading: "Caring for Your Dog",
    feesHeading: "Adoption Fees",
    feesNote:
      "Fees may change without prior notice; HKSCDA reserves the final right of decision.",
    dogFeeTitle: "Dog Adoption Fees",
    catFeeTitle: "Cat Adoption Fees",
    estatesHeading: "Dog-Friendly Estates (Reference List)",
    estatesNote: "For reference only — please check with estate management for current rules.",
    estateNameHeader: "Estate",
    districtHeader: "District",
    notesHeader: "Notes",
    estatesEmpty: "No estate data available yet. For the latest information, please",
    contactLink: "contact us",
    guidesHeading: "Post-Adoption Guides",
    catGuideTitle: "Post-Adoption Guide (Cats)",
    dogGuideTitle: "Post-Adoption Guide (Dogs)",
    generalGuideTitle: "Post-Adoption Guide",
    zhVersion: "中文版",
    enVersion: "English",
    languageToggleLabel: "Language",
  },
};
```

Update `InstructionsPage` to pass `language`/`setLanguage` down, and add the toggle. Change:

```tsx
function InstructionsPage() {
  const result = Route.useLoaderData();
  if (result.status === "error") {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入領養資訊"
        description="系統未能取得最新的領養流程與費用資料，請稍後再試。"
        action={
          <a href="/adoption/instructions" className="btn-primary min-h-11 px-5">
            重新載入
          </a>
        }
      />
    );
  }
  return <AdoptionInstructionsContent data={result.data} />;
}

export function AdoptionInstructionsContent({ data }: { data: PublicAdoptionPageData }) {
  return (
    <PublicPageFrame
      eyebrow="領養準備"
      title="領養需知"
      description="了解申請、家訪和日常照護，為你和動物做好長期準備。"
    >
      <div className="public-container space-y-12 py-4">
        <AdoptionInformationSections data={data} />

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">領養規則</h2>
          <ol className="space-y-3">
            {adoptionRules.map((rule, i) => (
              <li key={i} className="flex gap-3 text-[var(--color-text-muted)]">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">養貓需知</h2>
          <Tabs.Root defaultValue="home">
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {catCareTopics.map((t) => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-[var(--color-primary)] text-[var(--color-text-muted)]"
                >
                  {t.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {catCareTopics.map((t) => (
              <Tabs.Content
                key={t.value}
                value={t.value}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {t.content}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">養狗需知</h2>
          <Tabs.Root defaultValue="home">
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {dogCareTopics.map((t) => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-secondary)] data-[state=active]:text-[var(--color-secondary)] text-[var(--color-text-muted)]"
                >
                  {t.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {dogCareTopics.map((t) => (
              <Tabs.Content
                key={t.value}
                value={t.value}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {t.content}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>
      </div>
    </PublicPageFrame>
  );
}
```

to:

```tsx
function InstructionsPage() {
  const result = Route.useLoaderData();
  if (result.status === "error") {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入領養資訊"
        description="系統未能取得最新的領養流程與費用資料，請稍後再試。"
        action={
          <a href="/adoption/instructions" className="btn-primary min-h-11 px-5">
            重新載入
          </a>
        }
      />
    );
  }
  return <AdoptionInstructionsContent data={result.data} />;
}

export function AdoptionInstructionsContent({ data }: { data: PublicAdoptionPageData }) {
  const [language, setLanguage] = useState<AdoptionLanguage>("zh-HK");
  const copy = pageCopy[language];

  return (
    <PublicPageFrame
      eyebrow="領養準備"
      title="領養需知"
      description="了解申請、家訪和日常照護，為你和動物做好長期準備。"
    >
      <div className="public-container space-y-12 py-4" lang={language === "en" ? "en" : "zh-Hant-HK"}>
        <div className="flex justify-end gap-2" role="group" aria-label={copy.languageToggleLabel}>
          {(["zh-HK", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={language === value}
              onClick={() => setLanguage(value)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm font-semibold aria-pressed:border-[var(--color-primary)] aria-pressed:text-[var(--color-primary)]"
            >
              {value === "zh-HK" ? "中文" : "English"}
            </button>
          ))}
        </div>

        <AdoptionInformationSections data={data} language={language} copy={copy} />

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.rulesHeading}</h2>
          <ol className="space-y-3">
            {data.rules.map((rule, i) => (
              <li key={rule.id} className="flex gap-3 text-[var(--color-text-muted)]">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rule.content[language]}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.catCareHeading}</h2>
          <Tabs.Root defaultValue={data.careTopics.cat[0]?.id}>
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {data.careTopics.cat.map((topic) => (
                <Tabs.Trigger
                  key={topic.id}
                  value={topic.id}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-[var(--color-primary)] text-[var(--color-text-muted)]"
                >
                  {topic.label[language]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {data.careTopics.cat.map((topic) => (
              <Tabs.Content
                key={topic.id}
                value={topic.id}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {topic.content[language]}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.dogCareHeading}</h2>
          <Tabs.Root defaultValue={data.careTopics.dog[0]?.id}>
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {data.careTopics.dog.map((topic) => (
                <Tabs.Trigger
                  key={topic.id}
                  value={topic.id}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-secondary)] data-[state=active]:text-[var(--color-secondary)] text-[var(--color-text-muted)]"
                >
                  {topic.label[language]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {data.careTopics.dog.map((topic) => (
              <Tabs.Content
                key={topic.id}
                value={topic.id}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {topic.content[language]}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>
      </div>
    </PublicPageFrame>
  );
}
```

Now update `AdoptionInformationSections` (the fees/estates/guides section) to accept and use `language`/`copy` for its own static headings, WITHOUT changing the underlying fee/estate/guide data rendering (which stays exactly as today, per the design's decision). Change:

```tsx
function AdoptionInformationSections({ data }: { data: PublicAdoptionPageData }) {
  return (
    <>
      <section className="space-y-5" aria-labelledby="adoption-fees-title">
        <h2 id="adoption-fees-title" className="font-display text-2xl font-bold">
          領養費用
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <FeeTable title="狗隻領養費用" fees={data.feesBySpecies.dog} />
          <FeeTable title="貓隻領養費用" fees={data.feesBySpecies.cat} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="dog-estates-title">
        <h2 id="dog-estates-title" className="font-display text-2xl font-bold">
          可養狗屋苑參考名單
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          以下名單僅供參考，請向屋苑管理處查詢最新規定。
        </p>
        {data.estates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-3 py-3 font-bold">
                    屋苑
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    地區
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    備註
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.estates.map((estate) => (
                  <tr key={estate.id} className="border-b border-[var(--color-border)]">
                    <th scope="row" className="px-3 py-3 font-semibold">
                      {estate.estateName}
                    </th>
                    <td className="px-3 py-3">{estate.district}</td>
                    <td className="px-3 py-3">{estate.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            暫時未有屋苑資料。如需最新資訊，請
            <a href="/help#contact" className="font-bold text-[var(--color-primary)] underline">
              聯絡我們
            </a>
            。
          </p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="post-adoption-guides-title">
        <h2 id="post-adoption-guides-title" className="font-display text-2xl font-bold">
          領養後指南
        </h2>
        <div className="space-y-4">
          {data.guideGroups.map((group) => (
            <article key={group.species} className="space-y-2">
              <h3 className="font-display text-xl font-bold">
                {group.species === "cat"
                  ? "貓隻領養後指南"
                  : group.species === "dog"
                    ? "狗隻領養後指南"
                    : "領養後指南"}
              </h3>
              <div className="flex flex-wrap gap-3">
                <a
                  key={group.zhHk.id}
                  href={group.zhHk.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  中文版
                </a>
                <a
                  key={group.en.id}
                  href={group.en.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  English
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
```

to:

```tsx
function AdoptionInformationSections({
  data,
  language,
  copy,
}: {
  data: PublicAdoptionPageData;
  language: AdoptionLanguage;
  copy: (typeof pageCopy)[AdoptionLanguage];
}) {
  return (
    <>
      <section className="space-y-5" aria-labelledby="adoption-fees-title">
        <h2 id="adoption-fees-title" className="font-display text-2xl font-bold">
          {copy.feesHeading}
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <FeeTable title={copy.dogFeeTitle} fees={data.feesBySpecies.dog} />
          <FeeTable title={copy.catFeeTitle} fees={data.feesBySpecies.cat} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.feesNote}</p>
      </section>

      <section className="space-y-4" aria-labelledby="dog-estates-title">
        <h2 id="dog-estates-title" className="font-display text-2xl font-bold">
          {copy.estatesHeading}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.estatesNote}</p>
        {data.estates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.estateNameHeader}
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.districtHeader}
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.notesHeader}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.estates.map((estate) => (
                  <tr key={estate.id} className="border-b border-[var(--color-border)]">
                    <th scope="row" className="px-3 py-3 font-semibold">
                      {estate.estateName}
                    </th>
                    <td className="px-3 py-3">{estate.district}</td>
                    <td className="px-3 py-3">{estate.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            {copy.estatesEmpty}
            <a href="/help#contact" className="font-bold text-[var(--color-primary)] underline">
              {copy.contactLink}
            </a>
            {language === "zh-HK" ? "。" : "."}
          </p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="post-adoption-guides-title">
        <h2 id="post-adoption-guides-title" className="font-display text-2xl font-bold">
          {copy.guidesHeading}
        </h2>
        <div className="space-y-4">
          {data.guideGroups.map((group) => (
            <article key={group.species} className="space-y-2">
              <h3 className="font-display text-xl font-bold">
                {group.species === "cat"
                  ? copy.catGuideTitle
                  : group.species === "dog"
                    ? copy.dogGuideTitle
                    : copy.generalGuideTitle}
              </h3>
              <div className="flex flex-wrap gap-3">
                <a
                  key={group.zhHk.id}
                  href={group.zhHk.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  {copy.zhVersion}
                </a>
                <a
                  key={group.en.id}
                  href={group.en.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  {copy.enVersion}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
```

`FeeTable` itself is unchanged — it already takes `title` as a prop.

- [ ] **Step 3: Update the test file**

Read the current `src/routes/adoption/instructions.test.tsx` and update its test fixture `PublicAdoptionPageData` object to include `rules`/`careTopics` (matching the new type shape), and update any assertion that referenced the old static Chinese-only rule/topic text to instead reference the fixture's own bilingual content. Add a new test asserting the default language rendering:

```tsx
test("renders zh-HK bilingual rule content by default", () => {
  const data: PublicAdoptionPageData = {
    feesBySpecies: { dog: [], cat: [] },
    estates: [],
    guideGroups: [],
    rules: [
      {
        id: "11111111-2222-4333-8444-555555555555",
        content: { "zh-HK": "測試規則", en: "Test rule" },
        sortOrder: 0,
        isPublished: true,
      },
    ],
    careTopics: { cat: [], dog: [] },
  };

  const markup = renderToStaticMarkup(<AdoptionInstructionsContent data={data} />);
  expect(markup).toContain("測試規則");
  expect(markup).not.toContain("Test rule");
});
```

(Adjust this to match whatever rendering-test utility — `renderToStaticMarkup` or otherwise — the existing file already uses. `renderToStaticMarkup` alone cannot simulate a click to test the toggle's interactive switching behavior; this single default-language assertion confirming the DEFAULT render is zh-HK is sufficient and matches this file's existing SSR-only test conventions.)

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run typecheck
bun test src/routes/adoption/instructions.test.tsx 2>&1 | tail -15
```

Expected: typecheck clean; tests pass.

- [ ] **Step 5: Confirm the static content is fully gone**

```bash
grep -n "adoptionRules\|catCareTopics\|dogCareTopics" src/routes/adoption/instructions.tsx
```

Expected: no output (empty) — confirms the old hardcoded arrays were fully removed, not left dangling alongside the new database-backed rendering.

- [ ] **Step 6: Commit**

```bash
git add src/routes/adoption/instructions.tsx src/routes/adoption/instructions.test.tsx
git commit -m "feat: wire /adoption/instructions to database-backed rules and care topics with a language toggle"
```

---

### Task 12: Full verification gate

- [ ] **Step 1: The complete pre-PR gate**

```bash
bun run typecheck
bun test --isolate 2>&1 | tail -10
bun run lint 2>&1 | tail -10
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key bun run build 2>&1 | tail -5
git diff --exit-code -- src/routeTree.gen.ts
```

Expected: typecheck clean · 0 test failures project-wide · lint 0 errors · build OK · route-tree parity clean (this task adds no new routes, so this should already be a no-op diff — if it isn't, something unexpected changed the route tree and needs investigating before proceeding).

- [ ] **Step 2: Contract greps (paste outputs into the PR)**

```bash
# no service key/secret leaks into client paths
grep -rniE "service_role|SUPABASE_SERVICE" src/ --include=*.tsx --include=*.ts | grep -viE "\.server\.|routes/api/|\.functions\.ts|\.test\."
# no hardcoded colours in the new/touched admin components
grep -rnE "#[0-9a-fA-F]{6}" src/components/admin/content/AdoptionRulesManagement.tsx src/components/admin/content/CareTopicsManagement.tsx | grep -v "var(--"
# nothing outside the adoption-information domain and its public page touched
git diff origin/main...HEAD --stat -- src/routes/api/sponsorships/ src/routes/api/admin/sponsorships/ src/lib/faq/ src/routes/help.tsx src/lib/donations/
```

Expected: first two greps empty; third shows no changes (a sanity check nothing bled outside this domain).

- [ ] **Step 3: Confirm a clean tree**

```bash
git status --short
```

Expected: clean (everything committed in its task).

---

### Task 13: Open the draft PR

- [ ] **Step 1: Push and open**

```bash
git push -u origin docs/adoption-rules-care-topics-design
gh pr create --draft --title "Adoption rules & care topics CMS (BP-3 remainder, second slice)" --body "$(cat <<'EOF'
Moves /adoption/instructions's hardcoded, zh-HK-only adoptionRules/catCareTopics/dogCareTopics constants (~100 lines) into the existing adoptionInformation domain as two new admin-manageable, bilingual resources. This closes the "adoption rules and care-topic content" item explicitly deferred in the FAQ CMS design's Out of Scope section — the second and final piece of BP-3's remainder, alongside FAQ CMS (already shipped, PR #84) and home/about copy (still deferred to its own future phase).

Spec: docs/superpowers/specs/2026-08-30-adoption-rules-care-topics-design.md
Plan: docs/superpowers/plans/2026-08-30-adoption-rules-care-topics.md

**What staff get:** two new tabs on the existing /admin/content/adoption page — 領養規則 (a numbered, freely-ordered, bilingual rule list) and 動物照顧須知 (bilingual, species-scoped care topics, freely add/remove/reorder). Both use a plain bidirectional 在領養須知頁面顯示 publish toggle, matching how the existing fees tab already works (no separate delete action).

**What visitors get:** /adoption/instructions gains a 中文/English language toggle (this page previously had none at all) so the new bilingual content is actually visible in both languages. Fees, estates, and the post-adoption guide PDF section render exactly as before — only their surrounding headings now also respect the toggle, so the page doesn't look half-translated when switched.

**Architecture decisions (documented in the spec):**
1. Extends the existing adoptionInformation domain (not a new standalone domain) — reuses its per-resource-method pattern, and needs no new admin route, nav item, or access area, since /admin/content/adoption already exists and is already gated by contentManagement.
2. New mutations use the atomic *_with_audit RPC pattern (mirroring upsert_faq_entry_with_audit). The domain's existing fee/estate mutations use an older, non-atomic two-call audit pattern — a real, pre-existing gap, left untouched here and flagged as a separate follow-up rather than bundled into this work.
3. care_topics reuses the domain's existing animalType filter dimension (already used by fees) instead of being two separate resources.
4. English seed content for all 27 entries (12 rules + 15 care topics) was drafted as part of this work; staff can revise any of it through the new admin UI.

**Contracts held:** the fee/estate/guide-release rendering logic and data are completely unchanged; only their section headings became language-aware. No sponsorship/FAQ/donation route touched.

**Verification:** full gate green (typecheck, `bun test --isolate`, lint, build, route-tree parity — this PR adds no new routes); contract greps show no secret leakage and no unrelated route changes.

**⚠ Not applied to the live database.** supabase/migrations/20260830130000_adoption_rules_care_topics.sql ships in the repo only. Sequence the live-apply with the merge, matching the same caution as the FAQ CMS migration — until applied, /adoption/instructions's rules/care-topics sections will render empty (the old static content is deleted in this PR), though the rest of the page (fees, estates, guides) is unaffected either way.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Attach the verification outputs**

Post a PR comment with the Task 12 command outputs (typecheck/test/lint/build tails, route-tree parity, the three greps).

- [ ] **Step 3: Stop**

Wait for the tech lead's review. Do not merge. Flag clearly in the PR discussion that this migration must be applied to the live database in the same deploy window as the merge — the old static content is deleted, so an unapplied migration plus a merged code change means the rules/care-topics sections of `/adoption/instructions` render empty until the migration runs (unlike fees/estates/guides, which are unaffected).

---

## Self-review checklist (done at plan-writing time)

- **Spec coverage:** migration + atomic RPCs (Task 1), types/schemas (Task 2), repository (3), service (4), HTTP (5), public read path (6), shared tab-bar extraction (7), the two new admin components (8, 9), wiring them into the runtime (10), public route language toggle + rendering (11), full gate (12), draft PR (13). The spec's Out of Scope list (fee/estate translation, retrofitting the fee/estate audit bug, the adoption-guide-release PDF workflow, home/about copy, a language toggle anywhere else) has no corresponding task, as intended.
- **Placeholder scan:** no TBD/TODO; every code step shows complete, runnable code, including all 27 drafted English translations in Task 1's seed data.
- **Type consistency:** `AdoptionRuleContent`/`CareTopic`/`BilingualText`/`AdoptionLanguage` (Task 2) are the same types used unchanged through repository (3), service (4), http (5), public read (6), both admin components (8, 9), and the public route (11). `toRuleInput`/`toCareTopicInput`'s output shape matches `adoptionRuleInputSchema`/`careTopicInputSchema` exactly (Task 2's schemas, Tasks 8-9's mapping functions). `AdoptionContentTabs` (Task 7) is imported and used identically by `AdoptionInformationManagementView` (via `AdoptionInformationManagement.tsx` itself) and both new components (Tasks 8, 9).
- **Extraction/mirroring safety:** the `faq_entry` migration and `upsert_faq_entry_with_audit`'s exact body were read in full before being adapted (Task 1); the existing `adoptionInformation` domain's every file was read in full before being extended (Tasks 2-6); `AdoptionInformationManagement.tsx`'s existing 478-line structure, its test file's existing assertions, and `adoption-information.ts`'s route wiring were all read in full before Task 7/10's refactor and Task 8/9's new sibling components.
