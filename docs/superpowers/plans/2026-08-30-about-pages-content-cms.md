# About Pages Content CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hardcoded zh-HK marketing/mission copy on `/about`, `/about/tnr`, and `/about/cccp` into a new, admin-editable `aboutPages` domain, closing out "BP-3 remainder."

**Architecture:** A new domain `src/lib/aboutPages/` (schemas → service → repository.server → http.server), one Postgres table `about_page_content` (one row per page, a validated `jsonb` blob, no draft/publish state), one shared `security definer` RPC, and a new `/admin/content/about` admin UI. The three public routes read their content through a loader with an in-file default fallback, so a missing row renders identically to today.

**Tech Stack:** TanStack Start (SSR React 19 + TanStack Router), Supabase Postgres, Zod, `@tanstack/react-query`, Bun test runner.

---

## Reference: source spec

Full design rationale is in `docs/superpowers/specs/2026-08-30-about-pages-content-cms-design.md`. Read it once before starting if anything below is unclear — it explains *why* each decision was made (zh-HK only, fixed fields, immediate-on-save, new domain).

## Reference: exact current page copy

This is the literal text every DEFAULT_CONTENT constant and seed row below must match, transcribed from `src/routes/about/index.tsx`, `src/routes/about/tnr.tsx`, `src/routes/about/cccp.tsx` as they exist on `main` today. Every task below already embeds this — this section is just for cross-checking, not a separate step.

---

### Task 1: Migration — `about_page_content` table, RPC, seed data

**Files:**
- Create: `supabase/migrations/20260830140000_about_page_content.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Add a migration-safety test**

Open `src/lib/supabaseMigrations.test.ts` and add near the other recent-feature tests (follow the existing `readMigrationBySuffix` pattern used throughout this file):

```ts
test("adds about_page_content with a shared upsert RPC and seeds all three pages", () => {
  const sql = readMigrationBySuffix("_about_page_content.sql");

  expect(sql).toContain("create table if not exists public.about_page_content");
  expect(sql).toContain("page_slug text primary key check (page_slug in ('about', 'tnr', 'cccp'))");
  expect(sql).toContain("alter table public.about_page_content enable row level security");
  expect(sql).toContain(
    "grant select, insert, update, delete on public.about_page_content to service_role",
  );
  expect(sql).toContain("revoke all on public.about_page_content from anon, authenticated");
  expect(sql).toContain("create or replace function public.upsert_about_page_content_with_audit(");
  expect(sql).toContain("security definer");
  expect(sql).toContain("set search_path = public, pg_temp");
  expect(sql).toContain("where auth_user_id = p_actor_user_id");
  expect(sql).toContain("insert into public.audit_log");
  expect(sql).toContain(
    "revoke all on function public.upsert_about_page_content_with_audit(uuid, text, jsonb)",
  );
  expect(sql).toContain(
    "grant execute on function public.upsert_about_page_content_with_audit(uuid, text, jsonb)",
  );

  for (const slug of ["'about'", "'tnr'", "'cccp'"]) {
    expect(sql).toContain(`(${slug}, '{`);
  }
});
```

- [ ] **Step 3: Run the new test**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: PASS (the file-content assertions above don't need a database).

- [ ] **Step 4: Verify the migration against a real Postgres container**

This step exists because string-matching tests (Step 2) cannot catch actual SQL syntax errors — see `feedback_sql_migration_verification` precedent from the prior feature. This content is zh-HK only with no apostrophes, so the specific `E'...'`-prefix bug from last time doesn't apply here, but verify anyway since this is the house rule for every new migration with a security-definer RPC.

```bash
docker run -d --name about-pages-pg-check -e POSTGRES_PASSWORD=postgres -p 15433:5432 postgres:16-alpine
```

Wait for it to be ready (`docker logs about-pages-pg-check` should show "database system is ready to accept connections"), then create minimal stub tables the migration references:

```bash
cat > /tmp/about_pages_stub.sql << 'EOF'
create extension if not exists pgcrypto;
create table public.admin_user (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text not null unique,
  role text not null check (role in ('staff', 'admin')),
  status text not null default 'active'
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.admin_user (auth_user_id, email, role) values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local', 'staff');
EOF
MSYS_NO_PATHCONV=1 docker cp /tmp/about_pages_stub.sql about-pages-pg-check:/tmp/stub.sql
MSYS_NO_PATHCONV=1 docker exec about-pages-pg-check psql -U postgres -f /tmp/stub.sql
```

Then apply the real migration:

```bash
MSYS_NO_PATHCONV=1 docker cp supabase/migrations/20260830140000_about_page_content.sql about-pages-pg-check:/tmp/migration.sql
MSYS_NO_PATHCONV=1 docker exec about-pages-pg-check psql -U postgres -f /tmp/migration.sql
```

Expected: `CREATE TABLE`, `CREATE FUNCTION`, three `INSERT 0 1` lines (the `on conflict` upsert reports as insert), no `ERROR`.

Then verify the RPC actually works end-to-end:

```bash
MSYS_NO_PATHCONV=1 docker exec about-pages-pg-check psql -U postgres -c "select page_slug, jsonb_pretty(content)->'hero'->'title' as hero_title from public.about_page_content order by page_slug;"
MSYS_NO_PATHCONV=1 docker exec about-pages-pg-check psql -U postgres -c "select (public.upsert_about_page_content_with_audit('11111111-1111-4111-8111-111111111111', 'tnr', '{\"hero\":{\"eyebrow\":\"x\",\"title\":\"y\",\"description\":\"z\"}}'::jsonb)).page_slug;"
MSYS_NO_PATHCONV=1 docker exec about-pages-pg-check psql -U postgres -c "select count(*) from public.audit_log where entity = 'about_page_content';"
```

Expected: three rows with correct hero titles from the seed data; the RPC call returns `tnr`; the audit_log count is `1` (one row from the RPC call above — proving the atomic audit insert works).

Clean up:

```bash
docker rm -f about-pages-pg-check
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260830140000_about_page_content.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add about_page_content table, upsert RPC, and seed data"
```

---

### Task 2: Domain types and schemas

**Files:**
- Create: `src/lib/aboutPages/schemas.ts`
- Create: `src/lib/aboutPages/types.ts`
- Create: `src/lib/aboutPages/schemas.test.ts`

- [ ] **Step 1: Write `schemas.ts`**

```ts
import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const journeyStepSchema = z.object({
  title: shortText(40),
  description: shortText(300),
});

export const helpPathItemSchema = z.object({
  title: shortText(40),
  description: shortText(200),
  label: shortText(40),
});

export const aboutPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(300) }),
  mission: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    body: shortText(500),
    sideBadge: shortText(60),
    sideBody: shortText(300),
  }),
  impact: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(300) }),
  journey: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    steps: z.tuple([journeyStepSchema, journeyStepSchema, journeyStepSchema, journeyStepSchema]),
  }),
  communityBand: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    description: shortText(300),
    cccpCard: z.object({ title: shortText(40), description: shortText(200) }),
    tnrCard: z.object({ title: shortText(40), description: shortText(200) }),
  }),
  responsibleAdoption: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    body: shortText(500),
    linkLabel: shortText(40),
    sideTitle: shortText(100),
    principles: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
  helpPaths: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    items: z.tuple([
      helpPathItemSchema,
      helpPathItemSchema,
      helpPathItemSchema,
      helpPathItemSchema,
    ]),
  }),
  closing: z.object({
    title: shortText(100),
    description: shortText(300),
    buttonLabel: shortText(40),
  }),
});

export const tnrStageSchema = z.object({ title: shortText(40), description: shortText(300) });

export const tnrPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(500) }),
  stages: z.tuple([tnrStageSchema, tnrStageSchema, tnrStageSchema]),
  chapter: z.object({
    title: shortText(100),
    description: shortText(500),
    bullets: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
  cta: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    descriptionPrefix: shortText(300),
  }),
});

export const cccpChapterSchema = z.object({ title: shortText(100), description: shortText(500) });
export const workRowSchema = z.object({
  scope: shortText(100),
  method: shortText(100),
  result: shortText(100),
});

export const cccpPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(500) }),
  chapters: z.tuple([cccpChapterSchema, cccpChapterSchema]),
  workRows: z.tuple([workRowSchema, workRowSchema, workRowSchema]),
  workSectionTitle: shortText(60),
  cta: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    description: shortText(300),
    points: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
});

export const ABOUT_PAGE_SLUGS = ["about", "tnr", "cccp"] as const;

export const PAGE_CONTENT_SCHEMAS = {
  about: aboutPageContentSchema,
  tnr: tnrPageContentSchema,
  cccp: cccpPageContentSchema,
} as const;

export const aboutPageUpsertRequestSchema = z.discriminatedUnion("pageSlug", [
  z.object({ pageSlug: z.literal("about"), content: aboutPageContentSchema }),
  z.object({ pageSlug: z.literal("tnr"), content: tnrPageContentSchema }),
  z.object({ pageSlug: z.literal("cccp"), content: cccpPageContentSchema }),
]);
```

- [ ] **Step 2: Write `types.ts`**

```ts
import { z } from "zod";

import {
  aboutPageContentSchema,
  cccpChapterSchema,
  cccpPageContentSchema,
  helpPathItemSchema,
  journeyStepSchema,
  tnrPageContentSchema,
  tnrStageSchema,
  workRowSchema,
} from "./schemas";

export type AboutPageSlug = "about" | "tnr" | "cccp";

export type JourneyStep = z.infer<typeof journeyStepSchema>;
export type HelpPathItem = z.infer<typeof helpPathItemSchema>;
export type TnrStage = z.infer<typeof tnrStageSchema>;
export type CccpChapter = z.infer<typeof cccpChapterSchema>;
export type WorkRow = z.infer<typeof workRowSchema>;

export type AboutPageContent = z.infer<typeof aboutPageContentSchema>;
export type TnrPageContent = z.infer<typeof tnrPageContentSchema>;
export type CccpPageContent = z.infer<typeof cccpPageContentSchema>;

export type AnyAboutPageContent = AboutPageContent | TnrPageContent | CccpPageContent;
```

- [ ] **Step 3: Write `schemas.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

import {
  aboutPageContentSchema,
  aboutPageUpsertRequestSchema,
  cccpPageContentSchema,
  tnrPageContentSchema,
} from "./schemas";

const validAbout = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

const validCccp = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  chapters: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
  ],
  workRows: [
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
  ],
  workSectionTitle: "w",
  cta: { eyebrow: "e", title: "t", description: "d", points: ["1", "2", "3"] },
};

describe("aboutPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(aboutPageContentSchema.safeParse(validAbout).success).toBe(true);
  });

  test("rejects a journey with only 3 steps", () => {
    const invalid = { ...validAbout, journey: { ...validAbout.journey, steps: validAbout.journey.steps.slice(0, 3) } };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects an empty hero title", () => {
    const invalid = { ...validAbout, hero: { ...validAbout.hero, title: "" } };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects a mission body over 500 characters", () => {
    const invalid = { ...validAbout, mission: { ...validAbout.mission, body: "x".repeat(501) } };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("tnrPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(tnrPageContentSchema.safeParse(validTnr).success).toBe(true);
  });

  test("rejects only 2 stages", () => {
    const invalid = { ...validTnr, stages: validTnr.stages.slice(0, 2) };
    expect(tnrPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects only 2 chapter bullets", () => {
    const invalid = { ...validTnr, chapter: { ...validTnr.chapter, bullets: ["1", "2"] } };
    expect(tnrPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("cccpPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(cccpPageContentSchema.safeParse(validCccp).success).toBe(true);
  });

  test("rejects only 1 chapter", () => {
    const invalid = { ...validCccp, chapters: validCccp.chapters.slice(0, 1) };
    expect(cccpPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects only 2 work rows", () => {
    const invalid = { ...validCccp, workRows: validCccp.workRows.slice(0, 2) };
    expect(cccpPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("aboutPageUpsertRequestSchema", () => {
  test("routes each pageSlug to its own content schema", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "about", content: validAbout }).success,
    ).toBe(true);
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "tnr", content: validTnr }).success,
    ).toBe(true);
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "cccp", content: validCccp }).success,
    ).toBe(true);
  });

  test("rejects tnr content submitted under the about slug", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "about", content: validTnr }).success,
    ).toBe(false);
  });

  test("rejects an unknown pageSlug", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "team", content: validAbout }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/aboutPages/schemas.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aboutPages/schemas.ts src/lib/aboutPages/types.ts src/lib/aboutPages/schemas.test.ts
git commit -m "feat: add aboutPages domain types and per-page content schemas"
```

---

### Task 3: Repository

**Files:**
- Create: `src/lib/aboutPages/repository.server.ts`
- Create: `src/lib/aboutPages/repository.server.test.ts`

- [ ] **Step 1: Write `repository.server.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

const rowSchema = z.object({
  page_slug: z.enum(["about", "tnr", "cccp"]),
  content: z.unknown(),
});

export interface AboutPagesRepository {
  getContent(slug: AboutPageSlug): Promise<AnyAboutPageContent | null>;
  upsertContent(
    slug: AboutPageSlug,
    content: AnyAboutPageContent,
    actorAuthUserId: string,
  ): Promise<AnyAboutPageContent>;
}

export function createSupabaseAboutPagesRepository(client: SupabaseClient): AboutPagesRepository {
  return {
    async getContent(slug) {
      const { data, error } = await client
        .from("about_page_content")
        .select("page_slug,content")
        .eq("page_slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = rowSchema.safeParse(data);
      if (!row.success) return null;

      const schema = PAGE_CONTENT_SCHEMAS[slug];
      const parsed = schema.safeParse(row.data.content);
      return parsed.success ? parsed.data : null;
    },

    async upsertContent(slug, content, actorAuthUserId) {
      const { data, error } = await client.rpc("upsert_about_page_content_with_audit", {
        p_actor_user_id: actorAuthUserId,
        p_page_slug: slug,
        p_content: content,
      });
      if (error) throw error;

      const row = rowSchema.parse(data);
      const schema = PAGE_CONTENT_SCHEMAS[slug];
      return schema.parse(row.content);
    },
  };
}
```

- [ ] **Step 2: Write `repository.server.test.ts`**

Follow the fake-Supabase-client harness convention already used in `src/lib/adoptionInformation/repository.server.test.ts` / `src/lib/faq/repository.server.test.ts` — a minimal object shaped like the chain the repository calls.

```ts
import { describe, expect, mock, test } from "bun:test";

import { createSupabaseAboutPagesRepository } from "./repository.server";

const validAbout = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

function fakeClient({
  row,
  rpcData,
  rpcError,
}: {
  row?: { page_slug: string; content: unknown } | null;
  rpcData?: unknown;
  rpcError?: unknown;
} = {}) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: row ?? null, error: null }),
      };
    },
    rpc: mock(async () => ({ data: rpcData ?? null, error: rpcError ?? null })),
  } as never;
}

describe("createSupabaseAboutPagesRepository", () => {
  test("getContent returns null when no row exists", async () => {
    const repo = createSupabaseAboutPagesRepository(fakeClient({ row: null }));
    expect(await repo.getContent("about")).toBeNull();
  });

  test("getContent returns null when the row's content fails schema validation", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ row: { page_slug: "about", content: { hero: "not an object" } } }),
    );
    expect(await repo.getContent("about")).toBeNull();
  });

  test("getContent parses a valid row into the matching page schema", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ row: { page_slug: "about", content: validAbout } }),
    );
    const result = await repo.getContent("about");
    expect(result).toEqual(validAbout);
  });

  test("upsertContent calls the RPC with the actor's auth_user_id and the page slug", async () => {
    const client = fakeClient({ rpcData: { page_slug: "about", content: validAbout } });
    const repo = createSupabaseAboutPagesRepository(client);
    await repo.upsertContent("about", validAbout, "actor-auth-id");
    expect(client.rpc).toHaveBeenCalledWith("upsert_about_page_content_with_audit", {
      p_actor_user_id: "actor-auth-id",
      p_page_slug: "about",
      p_content: validAbout,
    });
  });

  test("upsertContent throws the underlying error on RPC failure", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ rpcError: { code: "42501", message: "forbidden" } }),
    );
    await expect(repo.upsertContent("about", validAbout, "actor-auth-id")).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/lib/aboutPages/repository.server.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aboutPages/repository.server.ts src/lib/aboutPages/repository.server.test.ts
git commit -m "feat: add aboutPages repository"
```

---

### Task 4: Service

**Files:**
- Create: `src/lib/aboutPages/service.ts`
- Create: `src/lib/aboutPages/service.test.ts`

- [ ] **Step 1: Write `service.ts`**

```ts
import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPagesRepository } from "./repository.server";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

export function createAboutPagesService({
  repo,
}: {
  repo: Pick<AboutPagesRepository, "getContent" | "upsertContent">;
}) {
  return {
    async listPublic() {
      const [about, tnr, cccp] = await Promise.all([
        repo.getContent("about"),
        repo.getContent("tnr"),
        repo.getContent("cccp"),
      ]);
      return { about, tnr, cccp };
    },

    // No separate audit() call here — upsert_about_page_content_with_audit
    // already writes the audit_log row atomically inside the same
    // transaction as the content change, same documented pattern as
    // adoptionInformation's upsertRule/upsertCareTopic.
    async upsertAdmin({
      actorUserId,
      pageSlug,
      content,
    }: {
      actorUserId: string;
      pageSlug: AboutPageSlug;
      content: unknown;
    }) {
      const schema = PAGE_CONTENT_SCHEMAS[pageSlug];
      const parsed = schema.parse(content) as AnyAboutPageContent;
      return repo.upsertContent(pageSlug, parsed, actorUserId);
    },
  };
}
```

- [ ] **Step 2: Write `service.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import { createAboutPagesService } from "./service";

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

function fakeRepo(overrides: Partial<{ getContent: unknown; upsertContent: unknown }> = {}) {
  return {
    getContent: mock(async () => null),
    upsertContent: mock(async (_slug: string, content: unknown) => content),
    ...overrides,
  } as never;
}

describe("createAboutPagesService", () => {
  test("listPublic fetches all three pages concurrently", async () => {
    const repo = fakeRepo({
      getContent: mock(async (slug: string) => ({ slug })),
    });
    const service = createAboutPagesService({ repo });
    const result = await service.listPublic();
    expect(result).toEqual({ about: { slug: "about" }, tnr: { slug: "tnr" }, cccp: { slug: "cccp" } });
  });

  test("upsertAdmin validates content against the page's own schema before delegating", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo });
    await service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: validTnr });
    expect(repo.upsertContent).toHaveBeenCalledWith("tnr", validTnr, "actor-1");
  });

  test("upsertAdmin rejects content that doesn't match the page's schema", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo });
    await expect(
      service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: { hero: {} } }),
    ).rejects.toThrow();
    expect(repo.upsertContent).not.toHaveBeenCalled();
  });

  test("upsertAdmin does not call any separate audit method — the RPC handles it atomically", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo });
    expect("insertAuditLog" in service).toBe(false);
    await service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: validTnr });
    // fakeRepo only defines getContent/upsertContent — if the service called
    // anything else, this test's fakeRepo would throw "not a function".
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/lib/aboutPages/service.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aboutPages/service.ts src/lib/aboutPages/service.test.ts
git commit -m "feat: add aboutPages service"
```

---

### Task 5: HTTP handlers and admin API route

**Files:**
- Create: `src/lib/aboutPages/http.server.ts`
- Create: `src/lib/aboutPages/http.server.test.ts`
- Create: `src/routes/api/admin/about-pages.ts`

- [ ] **Step 1: Write `http.server.ts`**

```ts
import { z } from "zod";

import { aboutPageUpsertRequestSchema } from "./schemas";
import type { AdminUser } from "../donations/supabase.server";
import type { createAboutPagesService } from "./service";

type HandlerContext = { request: Request };
type AboutPagesService = ReturnType<typeof createAboutPagesService>;

type CreateAdminAboutPagesHandlersArgs = {
  requireAboutPagesAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<AboutPagesService, "listPublic" | "upsertAdmin">;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function withAboutPagesErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return jsonNoStore(
        {
          error: "Invalid about page content",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    console.error(error);
    return jsonNoStore({ error: "Could not process about page request" }, { status: 500 });
  }
}

export function createAdminAboutPagesHandlers({
  requireAboutPagesAdmin,
  service,
}: CreateAdminAboutPagesHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withAboutPagesErrors(async () => {
        await requireAboutPagesAdmin(request);
        return jsonNoStore(await service.listPublic());
      });
    },

    upsert({ request }: HandlerContext) {
      return withAboutPagesErrors(async () => {
        const admin = await requireAboutPagesAdmin(request);
        const body = aboutPageUpsertRequestSchema.parse(await jsonBody(request));
        const content = await service.upsertAdmin({
          actorUserId: admin.authUserId,
          pageSlug: body.pageSlug,
          content: body.content,
        });
        return jsonNoStore({ pageSlug: body.pageSlug, content });
      });
    },
  };
}
```

Note: `admin.authUserId` (not `admin.id`) is used deliberately here — see the `fix/faq-actor-id` fix landed separately for why this distinction matters (the RPC's actor guard checks `auth_user_id`, a different UUID from `admin_user.id`).

- [ ] **Step 2: Write `http.server.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import { createAdminAboutPagesHandlers } from "./http.server";
import type { createAboutPagesService } from "./service";

const adminUserId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const admin = { id: adminUserId, authUserId, role: "admin" } as never;

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

function createService(overrides: Partial<ReturnType<typeof createAboutPagesService>> = {}) {
  return {
    listPublic: mock(async () => ({ about: null, tnr: null, cccp: null })),
    upsertAdmin: mock(async () => validTnr),
    ...overrides,
  } as unknown as ReturnType<typeof createAboutPagesService>;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createAdminAboutPagesHandlers", () => {
  test("list requires an admin and returns the service's data with no-store", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });

    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(requireAboutPagesAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(200);
  });

  test("list propagates a Response thrown by requireAboutPagesAdmin", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(403);
  });

  test("upsert calls service.upsertAdmin with the actor's authUserId, not id", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", content: validTnr }),
      }),
    });

    expect(response.status).toBe(200);
    expect(service.upsertAdmin).toHaveBeenCalledWith({
      actorUserId: authUserId,
      pageSlug: "tnr",
      content: validTnr,
    });
  });

  test("upsert returns 400 on invalid JSON", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "PUT", body: "not json" }),
    });
    expect(response.status).toBe(400);
  });

  test("upsert returns 400 with issue details on a zod validation error", async () => {
    const service = createService({
      upsertAdmin: mock(async () => {
        const { z } = await import("zod");
        throw new z.ZodError([
          { code: "custom", path: ["hero", "title"], message: "Required" } as never,
        ]);
      }),
    });
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", content: validTnr }),
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.issues[0].path).toBe("hero.title");
  });

  test("upsert returns 400 when pageSlug is unknown", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "team", content: validTnr }),
      }),
    });
    expect(response.status).toBe(400);
  });

  test("an unexpected error falls through to a generic 500", async () => {
    const service = createService({
      listPublic: mock(async () => {
        throw new Error("db exploded");
      }),
    });
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: Write the API route**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createAdminAboutPagesHandlers } from "../../../lib/aboutPages/http.server";
import { createSupabaseAboutPagesRepository } from "../../../lib/aboutPages/repository.server";
import { createAboutPagesService } from "../../../lib/aboutPages/service";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminAboutPagesHandlers({
    requireAboutPagesAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createAboutPagesService({ repo: createSupabaseAboutPagesRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/about-pages")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      PUT: ({ request }) => createHandlers().upsert({ request }),
    },
  },
});
```

Save as `src/routes/api/admin/about-pages.ts`.

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/aboutPages/http.server.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (this confirms the route file's imports resolve correctly).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aboutPages/http.server.ts src/lib/aboutPages/http.server.test.ts src/routes/api/admin/about-pages.ts
git commit -m "feat: add aboutPages admin HTTP handlers and API route"
```

---

### Task 6: Public server functions

**Files:**
- Create: `src/lib/aboutPages/publicPage.server.ts`
- Create: `src/lib/aboutPages/publicPage.functions.ts`
- Create: `src/lib/aboutPages/publicPage.server.test.ts`

- [ ] **Step 1: Write `publicPage.server.ts`**

```ts
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAboutPagesRepository } from "./repository.server";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

export async function loadAboutPageContent(
  slug: AboutPageSlug,
): Promise<AnyAboutPageContent | null> {
  try {
    const client = createSupabaseServiceClient();
    return await createSupabaseAboutPagesRepository(client).getContent(slug);
  } catch {
    return null;
  }
}
```

This deliberately never throws — a database error or a missing/malformed row both resolve to `null`, and the calling route falls back to its hardcoded default (Task 7-9). This is stricter than `adoptionInformation`'s `loadPublicAdoptionPage()`, which throws on failure — that page shows an error state on failure being acceptable for a fee table, whereas a blank About hero would be a worse regression than showing today's default copy.

- [ ] **Step 2: Write `publicPage.functions.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";

export const getAboutPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("about");
});

export const getTnrPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("tnr");
});

export const getCccpPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("cccp");
});
```

- [ ] **Step 3: Write `publicPage.server.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

describe("loadAboutPageContent", () => {
  test("returns the repository's content when the lookup succeeds", async () => {
    const content = { hero: { eyebrow: "e", title: "t", description: "d" } };
    mock.module("../donations/supabase.server", () => ({
      createSupabaseServiceClient: () => ({}),
    }));
    mock.module("./repository.server", () => ({
      createSupabaseAboutPagesRepository: () => ({
        getContent: async () => content,
      }),
    }));
    const { loadAboutPageContent } = await import("./publicPage.server");
    expect(await loadAboutPageContent("about")).toEqual(content);
  });

  test("returns null instead of throwing when the client can't be created", async () => {
    mock.module("../donations/supabase.server", () => ({
      createSupabaseServiceClient: () => {
        throw new Error("missing env vars");
      },
    }));
    const { loadAboutPageContent } = await import("./publicPage.server");
    expect(await loadAboutPageContent("about")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/aboutPages/publicPage.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aboutPages/publicPage.server.ts src/lib/aboutPages/publicPage.functions.ts src/lib/aboutPages/publicPage.server.test.ts
git commit -m "feat: add aboutPages public server functions"
```

---

### Task 7: Wire `/about`

**Files:**
- Modify: `src/routes/about/index.tsx`
- Modify: `src/routes/about/index.test.tsx`

- [ ] **Step 1: Add the default content constant and loader wiring**

Open `src/routes/about/index.tsx`. Add near the top, after the existing imports, a new import and the default-content constant:

```ts
import type { AboutPageContent } from "../../lib/aboutPages/types";
import { getAboutPageContent } from "../../lib/aboutPages/publicPage.functions";
```

```ts
const DEFAULT_ABOUT_CONTENT: AboutPageContent = {
  hero: {
    eyebrow: "香港本地動物救援慈善機構",
    title: "領養代替購買",
    description: "救援、醫療、絕育與負責任領養，以社區力量守護香港流浪貓狗。",
  },
  mission: {
    eyebrow: "我們的使命",
    title: "讓每一個生命都有重新開始的機會",
    body: "香港拯救貓狗協會自2007年起，透過救援、醫療、絕育和領養工作，為被遺棄及流浪動物提供實際支援。我們相信負責任的領養需要透明資訊、耐心配對和社區共同參與。",
    sideBadge: "以動物福祉為先",
    sideBody: "我們與義工、領養家庭及社區夥伴一起，讓照護和善意可以持續發生。",
  },
  impact: {
    eyebrow: "可核實的公開資料",
    title: "目前照護中的動物",
    description: "數字只在資料庫成功回傳並大於零時顯示，並標示資料日期。",
  },
  journey: {
    eyebrow: "我們如何工作",
    title: "從救援到找到家，四個重要步驟",
    steps: [
      { title: "救援", description: "接收需要即時協助的流浪、受傷或被遺棄貓狗。" },
      { title: "醫療照護", description: "安排檢查、治療、疫苗和日常照護，讓動物恢復健康。" },
      { title: "絕育", description: "透過絕育及社區合作，減少繁殖和流浪動物數目。" },
      { title: "配對領養", description: "了解家庭需要，為動物配對負責任而長久的家。" },
    ],
  },
  communityBand: {
    eyebrow: "社區合作",
    title: "CCCP 與 TNR，從源頭改善動物處境",
    description:
      "社區貓隻照顧計劃和捕捉、絕育、放回工作，讓動物福利不只發生在收容和領養，也能在社區中長久改善。",
    cccpCard: { title: "CCCP 計劃", description: "了解社區貓隻照顧的合作方法。" },
    tnrCard: { title: "TNR 計劃", description: "了解捕捉、絕育、放回的社區行動。" },
  },
  responsibleAdoption: {
    eyebrow: "負責任領養",
    title: "領養是一段需要準備的長期承諾",
    body: "了解家庭環境、時間安排和照護能力，讓你和動物都能安心開始。領養費用及流程等操作指引，請參閱領養需知。",
    linkLabel: "閱讀領養需知",
    sideTitle: "我們重視的配對原則",
    principles: [
      "先了解動物需要，再評估家庭是否合適",
      "把醫療、絕育和日常照護納入長期規劃",
      "以耐心和責任建立穩定而安全的關係",
    ],
  },
  helpPaths: {
    eyebrow: "一起幫助",
    title: "你可以用四種方式加入",
    items: [
      { title: "領養動物", description: "看看正在等待家庭的貓貓和狗狗。", label: "查看待領養動物" },
      { title: "助養生命", description: "以每月支持幫助動物獲得持續照護。", label: "了解助養" },
      { title: "加入義工", description: "用時間和專長支援救援及社區工作。", label: "加入義工" },
      { title: "立即捐助", description: "支持醫療、絕育和日常救援所需。", label: "支持協會" },
    ],
  },
  closing: {
    title: "讓下一個家，從今天開始",
    description: "看看正在等待領養的動物，或者用你的支持讓更多救援可以繼續。",
    buttonLabel: "查看待領養動物",
  },
};

const JOURNEY_ICONS = [Heart, Stethoscope, Syringe, Home] as const;
const HELP_PATH_HREFS = ["/animals/cat", "/sponsors", "/volunteer", "/donate"] as const;
```

- [ ] **Step 2: Update the loader to fetch content alongside impact items**

Replace:

```ts
  loader: () => getPublicImpactItems(),
```

with:

```ts
  loader: async () => {
    const [impact, content] = await Promise.all([getPublicImpactItems(), getAboutPageContent()]);
    return { impact, content };
  },
```

- [ ] **Step 3: Update `AboutPage` and `AboutContent` to thread content through**

Replace:

```ts
export function AboutPage() {
  const { items } = Route.useLoaderData();
  return <AboutContent impact={items} />;
}

export function AboutContent({ impact }: { impact: PublicImpactItem[] }) {
```

with:

```ts
export function AboutPage() {
  const { impact, content } = Route.useLoaderData();
  return <AboutContent impact={impact.items} content={content} />;
}

export function AboutContent({
  impact,
  content = DEFAULT_ABOUT_CONTENT,
}: {
  impact: PublicImpactItem[];
  content?: AboutPageContent | null;
}) {
  const page = content ?? DEFAULT_ABOUT_CONTENT;
```

- [ ] **Step 4: Replace every hardcoded string in the JSX with `page.*` reads**

Within the rest of `AboutContent`'s JSX (everything from `<PublicPageFrame` to the closing `</PublicPageFrame>`), replace each literal with the matching field from `page`, and replace the `journey`/`helpPaths` local arrays with zips against the new icon/href constants. The full replacement body:

```tsx
  return (
    <PublicPageFrame
      eyebrow={page.hero.eyebrow}
      title={page.hero.title}
      description={page.hero.description}
      image={heroImg}
      imageAlt="在協會犬舍外開心迎接訪客的獲救唐狗"
      actions={[
        { label: "查看待領養動物", to: "/animals/cat" },
        { label: "立即捐助", to: "/donate" },
      ]}
    >
      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <SectionHeading eyebrow={page.mission.eyebrow} title={page.mission.title} />
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)]">
              {page.mission.body}
            </p>
          </div>
          <div className="border-l-4 border-[var(--color-secondary)] pl-6">
            <PublicStatusBadge tone="info" icon={ShieldCheck}>
              {page.mission.sideBadge}
            </PublicStatusBadge>
            <p className="mt-4 text-base leading-relaxed text-[var(--color-text-muted)]">
              {page.mission.sideBody}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--color-divider)] bg-[var(--color-surface-offset)]">
        <div className="container-wide px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow={page.impact.eyebrow}
            title={page.impact.title}
            description={page.impact.description}
          />
          {impact.length > 0 ? (
            <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {impact.map((item) => (
                <div key={item.label} className="border-t-4 border-[var(--color-primary)] pt-4">
                  <dt className="text-sm font-bold text-[var(--color-text-muted)]">{item.label}</dt>
                  <dd className="mt-2 text-4xl font-bold text-[var(--color-primary)]">
                    {item.value.toLocaleString("zh-HK")}
                  </dd>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    資料截至 {item.asOf}
                  </p>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mt-8">
              <PublicStatusBadge tone="neutral" icon={CheckCircle2}>
                暫無可核實數據
              </PublicStatusBadge>
            </div>
          )}
        </div>
      </section>

      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={page.journey.eyebrow} title={page.journey.title} />
        <div className="mt-10 grid gap-8 md:grid-cols-4">
          {page.journey.steps.map(({ title, description }, index) => {
            const Icon = JOURNEY_ICONS[index];
            return (
              <div key={title} className="border-t border-[var(--color-border)] pt-5">
                <div className="flex items-center gap-3 text-[var(--color-primary)]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="text-xs font-bold tracking-wide">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-[var(--color-text)]">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[var(--color-divider)] bg-[var(--color-panel)] text-white">
        <div className="container-wide grid gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-sm font-bold tracking-wide text-white/80">
              {page.communityBand.eyebrow}
            </p>
            <h2 className="mt-2 max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl">
              {page.communityBand.title}
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-white/80">
              {page.communityBand.description}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <a href="/about/cccp" className="border border-white/25 p-5 hover:border-white">
              <Users className="h-6 w-6" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-bold">{page.communityBand.cccpCard.title}</h3>
              <p className="mt-2 text-sm text-white/75">
                {page.communityBand.cccpCard.description}
              </p>
              <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold">
                了解更多 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
            <a href="/about/tnr" className="border border-white/25 p-5 hover:border-white">
              <Syringe className="h-6 w-6" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-bold">{page.communityBand.tnrCard.title}</h3>
              <p className="mt-2 text-sm text-white/75">{page.communityBand.tnrCard.description}</p>
              <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold">
                了解更多 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
          </div>
        </div>
      </section>

      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow={page.responsibleAdoption.eyebrow}
              title={page.responsibleAdoption.title}
            />
            <p className="mt-5 leading-relaxed text-[var(--color-text-muted)]">
              {page.responsibleAdoption.body}
            </p>
            <a href="/adoption/instructions" className="btn-secondary mt-6 min-h-11 px-5">
              {page.responsibleAdoption.linkLabel}
            </a>
          </div>
          <div className="border-t-4 border-[var(--color-secondary)] pt-5">
            <h3 className="text-xl font-bold text-[var(--color-text)]">
              {page.responsibleAdoption.sideTitle}
            </h3>
            <ul className="mt-5 space-y-4 text-[var(--color-text-muted)]">
              {page.responsibleAdoption.principles.map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--color-divider)] bg-[var(--color-surface-offset)]">
        <div className="container-wide px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading eyebrow={page.helpPaths.eyebrow} title={page.helpPaths.title} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {page.helpPaths.items.map((path, index) => (
              <a
                key={path.title}
                href={HELP_PATH_HREFS[index]}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-primary)]"
              >
                <h3 className="text-lg font-bold text-[var(--color-text)]">{path.title}</h3>
                <p className="mt-3 min-h-12 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {path.description}
                </p>
                <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--color-primary)]">
                  {path.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="container-wide px-4 py-16 text-center sm:px-6 lg:px-8">
        <SectionHeading
          align="center"
          title={page.closing.title}
          description={page.closing.description}
        />
        <a href="/animals/cat" className="btn-primary mt-7 min-h-12 px-6 text-base">
          {page.closing.buttonLabel}
        </a>
      </section>
    </PublicPageFrame>
  );
}
```

- [ ] **Step 5: Update `index.test.tsx`**

The existing test calls `<AboutContent impact={[]} />` with no `content` prop, which now defaults to `DEFAULT_ABOUT_CONTENT` — it should pass unchanged. Add one new test confirming the fallback and one confirming loaded content overrides it:

```tsx
  test("falls back to the default content when no content prop is given", () => {
    const markup = renderToStaticMarkup(<AboutContent impact={[]} />);
    expect(markup).toContain("讓每一個生命都有重新開始的機會");
  });

  test("renders loaded content in place of the default when provided", () => {
    const custom = {
      ...DEFAULT_ABOUT_CONTENT_FOR_TEST,
      hero: { ...DEFAULT_ABOUT_CONTENT_FOR_TEST.hero, title: "自訂標題" },
    };
    const markup = renderToStaticMarkup(<AboutContent impact={[]} content={custom} />);
    expect(markup).toContain("自訂標題");
    expect(markup).not.toContain("領養代替購買");
  });
```

Since `DEFAULT_ABOUT_CONTENT` is not exported from `index.tsx` (it's an internal fallback, not part of the page's public surface), define a small local fixture at the top of the test file instead of importing it — add this above the `describe` block:

```tsx
const DEFAULT_ABOUT_CONTENT_FOR_TEST = {
  hero: { eyebrow: "e", title: "領養代替購買", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
} as const;
```

- [ ] **Step 6: Run the tests**

Run: `bun test src/routes/about/index.test.tsx`
Expected: PASS — the original test still passes unchanged (fallback renders identical copy), plus the 2 new tests.

- [ ] **Step 7: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/routes/about/index.tsx src/routes/about/index.test.tsx
git commit -m "feat: wire /about to database-backed content with a hardcoded fallback"
```

---

### Task 8: Wire `/about/tnr`

**Files:**
- Modify: `src/routes/about/tnr.tsx`
- Create: `src/routes/about/tnr.test.tsx`

- [ ] **Step 1: Rewrite `tnr.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { brand } from "../../lib/brand/brand";
import { getTnrPageContent } from "../../lib/aboutPages/publicPage.functions";
import type { TnrPageContent } from "../../lib/aboutPages/types";

export const Route = createFileRoute("/about/tnr")({
  head: () => ({
    meta: [
      { title: "TNR 捕捉絕育放回 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "TNR 是管理社區流浪貓的人道方法：誘捕、絕育、原地放回，並配合持續照顧逐步減少繁殖壓力。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/tnr") }],
  }),
  loader: () => getTnrPageContent(),
  component: TNRPage,
});

const STAGE_KICKERS = ["01", "02", "03"] as const;

const DEFAULT_TNR_CONTENT: TnrPageContent = {
  hero: {
    eyebrow: "我們的工作",
    title: "TNR 捕捉絕育放回",
    description:
      "誘捕、絕育、放回（Trap-Neuter-Return）是管理社區流浪貓的其中一種人道方法，透過捕捉、絕育和原地放回，配合持續照顧，逐步減少繁殖壓力。",
  },
  stages: [
    { title: "誘捕 Trap", description: "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。" },
    { title: "絕育 Neuter", description: "送往合作獸醫診所進行絕育手術，同時安排基本健康檢查。" },
    { title: "放回 Return", description: "手術後在原地放回，繼續由 CCCP 義工照顧和觀察。" },
  ],
  chapter: {
    title: "社區參與",
    description:
      "如果你發現社區有需要協助的流浪貓，請先記錄地點、數量和狀況，再聯絡協會了解合適的支援方法。正確的資訊和持續觀察，有助義工安排後續工作。",
    bullets: ["記錄地點與數量", "留意受傷或疾病徵狀", "聯絡協會安排跟進"],
  },
  cta: {
    eyebrow: "一起參與",
    title: "TNR 需要社區的眼睛和雙手。",
    descriptionPrefix: "義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵",
  },
};

export function TNRPage() {
  const content = Route.useLoaderData();
  return <TNRContent content={content} />;
}

export function TNRContent({ content }: { content?: TnrPageContent | null }) {
  const page = content ?? DEFAULT_TNR_CONTENT;
  return (
    <PublicPageFrame
      eyebrow={page.hero.eyebrow}
      title={page.hero.title}
      description={page.hero.description}
      highlights={page.stages.map((stage, index) => ({
        kicker: STAGE_KICKERS[index],
        title: stage.title,
        description: stage.description,
      }))}
      chapters={[
        {
          title: page.chapter.title,
          description: page.chapter.description,
          bullets: [...page.chapter.bullets],
        },
      ]}
      cta={{
        eyebrow: page.cta.eyebrow,
        title: page.cta.title,
        description: page.cta.descriptionPrefix + " " + brand.org.email + "。",
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    />
  );
}
```

- [ ] **Step 2: Write `tnr.test.tsx`**

```tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TNRContent } from "./tnr";
import { brand } from "../../lib/brand/brand";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

describe("TNRContent", () => {
  test("falls back to the default content and appends brand.org.email to the CTA", () => {
    const markup = renderToStaticMarkup(<TNRContent content={null} />);
    expect(markup).toContain("TNR 捕捉絕育放回");
    expect(markup).toContain("誘捕 Trap");
    expect(markup).toContain("義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵 " + brand.org.email + "。");
  });

  test("renders loaded content in place of the default", () => {
    const custom = {
      hero: { eyebrow: "e", title: "自訂 TNR 標題", description: "d" },
      stages: [
        { title: "1", description: "d" },
        { title: "2", description: "d" },
        { title: "3", description: "d" },
      ],
      chapter: { title: "t", description: "d", bullets: ["a", "b", "c"] },
      cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
    };
    const markup = renderToStaticMarkup(<TNRContent content={custom} />);
    expect(markup).toContain("自訂 TNR 標題");
    expect(markup).not.toContain("TNR 捕捉絕育放回");
  });
});
```

Note the top of the file needs `mock` imported from `bun:test` alongside `describe`/`expect`/`test` — use `import { describe, expect, mock, test } from "bun:test";`.

- [ ] **Step 3: Run the tests**

Run: `bun test src/routes/about/tnr.test.tsx`
Expected: PASS, both tests green.

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/about/tnr.tsx src/routes/about/tnr.test.tsx
git commit -m "feat: wire /about/tnr to database-backed content with a hardcoded fallback"
```

---

### Task 9: Wire `/about/cccp`

**Files:**
- Modify: `src/routes/about/cccp.tsx`
- Create: `src/routes/about/cccp.test.tsx`

- [ ] **Step 1: Rewrite `cccp.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { brand } from "../../lib/brand/brand";
import { getCccpPageContent } from "../../lib/aboutPages/publicPage.functions";
import type { CccpPageContent } from "../../lib/aboutPages/types";

export const Route = createFileRoute("/about/cccp")({
  head: () => ({
    meta: [
      { title: "CCCP 社區貓照顧計劃 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "CCCP 是香港拯救貓狗協會的社區流浪貓管理計劃，透過義工訓練、日常照顧與絕育合作改善社區與貓隻的生活。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/cccp") }],
  }),
  loader: () => getCccpPageContent(),
  component: CCCPPage,
});

const DEFAULT_CCCP_CONTENT: CccpPageContent = {
  hero: {
    eyebrow: "我們的工作",
    title: "CCCP 社區貓照顧計劃",
    description:
      "社區貓照顧計劃（Community Cat Care Program）以社區參與、日常觀察和絕育合作，建立可持續的照顧網絡。",
  },
  chapters: [
    {
      title: "什麼是 CCCP",
      description:
        "CCCP 是香港拯救貓狗協會推行的社區流浪貓管理計劃。計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合 TNR 絕育工作，逐步改善貓隻和社區的生活質素。",
    },
    {
      title: "為何需要 CCCP",
      description:
        "有系統的照顧能讓社區居民與流浪貓和諧共存，並及早發現受傷、疾病和未絕育的貓隻，連接合適的義工和獸醫支援。",
    },
  ],
  workRows: [
    { scope: "日常照顧", method: "定點餵食、清潔和觀察", result: "及早發現需要協助的動物" },
    { scope: "絕育合作", method: "配合 TNR 安排手術", result: "減少繁殖和流浪壓力" },
    { scope: "社區溝通", method: "由義工連接居民和協會", result: "降低衝突，分享正確照顧方法" },
  ],
  workSectionTitle: "CCCP 的工作方式",
  cta: {
    eyebrow: "參與其中",
    title: "你可以擔任義工、捐款或捐贈物資。",
    description: "如有興趣參與社區貓照顧工作，可先了解目前的義工崗位，或直接聯絡團隊。",
    points: ["義工訓練與日常照顧", "配合絕育安排", "社區溝通與教育"],
  },
};

export function CCCPPage() {
  const content = Route.useLoaderData();
  return <CCCPContent content={content} />;
}

export function CCCPContent({ content }: { content?: CccpPageContent | null }) {
  const page = content ?? DEFAULT_CCCP_CONTENT;
  return (
    <PublicPageFrame
      eyebrow={page.hero.eyebrow}
      title={page.hero.title}
      description={page.hero.description}
      chapters={page.chapters.map((chapter) => ({
        title: chapter.title,
        description: chapter.description,
      }))}
      cta={{
        eyebrow: page.cta.eyebrow,
        title: page.cta.title,
        description: page.cta.description,
        points: [...page.cta.points],
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    >
      <section className="section">
        <div className="public-container">
          <div className="content-chapter">
            <h2>{page.workSectionTitle}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">工作範圍</th>
                    <th scope="col">社區做法</th>
                    <th scope="col">動物福利結果</th>
                  </tr>
                </thead>
                <tbody>
                  {page.workRows.map((row) => (
                    <tr key={row.scope}>
                      <th scope="row">{row.scope}</th>
                      <td>{row.method}</td>
                      <td>{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              查詢可電郵 <a href={"mailto:" + brand.org.email}>{brand.org.email}</a> 或 WhatsApp{" "}
              {brand.org.phone}。
            </p>
          </div>
        </div>
      </section>
    </PublicPageFrame>
  );
}
```

- [ ] **Step 2: Write `cccp.test.tsx`**

```tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CCCPContent } from "./cccp";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

describe("CCCPContent", () => {
  test("falls back to the default content", () => {
    const markup = renderToStaticMarkup(<CCCPContent content={null} />);
    expect(markup).toContain("CCCP 社區貓照顧計劃");
    expect(markup).toContain("什麼是 CCCP");
    expect(markup).toContain("日常照顧");
    expect(markup).toContain("CCCP 的工作方式");
  });

  test("renders loaded content in place of the default", () => {
    const custom = {
      hero: { eyebrow: "e", title: "自訂 CCCP 標題", description: "d" },
      chapters: [
        { title: "1", description: "d" },
        { title: "2", description: "d" },
      ],
      workRows: [
        { scope: "s", method: "m", result: "r" },
        { scope: "s", method: "m", result: "r" },
        { scope: "s", method: "m", result: "r" },
      ],
      workSectionTitle: "自訂表格標題",
      cta: { eyebrow: "e", title: "t", description: "d", points: ["1", "2", "3"] },
    };
    const markup = renderToStaticMarkup(<CCCPContent content={custom} />);
    expect(markup).toContain("自訂 CCCP 標題");
    expect(markup).toContain("自訂表格標題");
    expect(markup).not.toContain("CCCP 社區貓照顧計劃");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/routes/about/cccp.test.tsx`
Expected: PASS, both tests green.

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/about/cccp.tsx src/routes/about/cccp.test.tsx
git commit -m "feat: wire /about/cccp to database-backed content with a hardcoded fallback"
```

---

### Task 10: Admin UI

**Files:**
- Create: `src/components/admin/content/AboutPagesManagement.tsx`
- Create: `src/components/admin/content/AboutPagesManagement.test.tsx`
- Create: `src/routes/admin/content/about.tsx`

- [ ] **Step 1: Write `AboutPagesManagement.tsx`**

This domain has no list of records to page/search through — each tab is a single fixed-shape form. Structure it as a stateful runtime component (data fetching) wrapping a pure view component (so tests can render the view directly with static content, matching `AdoptionInformationManagement`'s `initialData` testability pattern).

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { AboutPageContent, AboutPageSlug, CccpPageContent, TnrPageContent } from "../../../lib/aboutPages/types";

export const ABOUT_PAGES_QUERY_KEY = ["admin-about-pages"] as const;

type PagesData = { about: AboutPageContent | null; tnr: TnrPageContent | null; cccp: CccpPageContent | null };

const TABS: readonly [AboutPageSlug, string][] = [
  ["about", "關於我們"],
  ["tnr", "TNR"],
  ["cccp", "CCCP"],
];

export function invalidateAboutPagesQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ABOUT_PAGES_QUERY_KEY });
}

export function AboutPagesManagement() {
  return <AboutPagesManagementRuntime />;
}

function AboutPagesManagementRuntime() {
  const [activeTab, setActiveTab] = useState<AboutPageSlug>("about");
  const queryClient = useQueryClient();

  const pagesQuery = useQuery({
    queryKey: ABOUT_PAGES_QUERY_KEY,
    queryFn: () => fetchAdminJson<PagesData>("/api/admin/about-pages"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: { pageSlug: AboutPageSlug; content: unknown }) =>
      fetchAdminJson("/api/admin/about-pages", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => invalidateAboutPagesQueries(queryClient),
  });

  if (pagesQuery.isLoading) return <p aria-live="polite">載入頁面內容中…</p>;
  if (pagesQuery.isError || !pagesQuery.data) {
    return (
      <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
        未能載入頁面內容，請重新整理頁面。
      </p>
    );
  }

  return (
    <AboutPagesManagementView
      activeTab={activeTab}
      onTabChange={setActiveTab}
      data={pagesQuery.data}
      onSave={(pageSlug, content) => upsertMutation.mutate({ pageSlug, content })}
      isSaving={upsertMutation.isPending}
      isSaveError={upsertMutation.isError}
    />
  );
}

export function AboutPagesManagementView({
  activeTab,
  onTabChange,
  data,
  onSave,
  isSaving,
  isSaveError,
}: {
  activeTab: AboutPageSlug;
  onTabChange: (tab: AboutPageSlug) => void;
  data: PagesData;
  onSave: (pageSlug: AboutPageSlug, content: unknown) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳內容</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">關於頁面管理</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map(([slug, label]) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={activeTab === slug}
            className={
              "min-h-11 px-4 py-2 " +
              (activeTab === slug ? "border-b-2 border-[var(--color-primary)] font-bold" : "")
            }
            onClick={() => onTabChange(slug)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "about" && data.about ? (
        <AboutTabForm content={data.about} onSave={(c) => onSave("about", c)} isSaving={isSaving} isSaveError={isSaveError} />
      ) : null}
      {activeTab === "tnr" && data.tnr ? (
        <TnrTabForm content={data.tnr} onSave={(c) => onSave("tnr", c)} isSaving={isSaving} isSaveError={isSaveError} />
      ) : null}
      {activeTab === "cccp" && data.cccp ? (
        <CccpTabForm content={data.cccp} onSave={(c) => onSave("cccp", c)} isSaving={isSaving} isSaveError={isSaveError} />
      ) : null}
    </div>
  );
}

function SaveBar({ isSaving, isSaveError }: { isSaving: boolean; isSaveError: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button type="submit" className="btn-primary min-h-11 px-4" disabled={isSaving}>
        儲存
      </button>
      {isSaveError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          儲存失敗，請檢查資料後再試一次。
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const inputClassName = "mt-1 block w-full border border-[var(--color-border)] px-3 py-2";
  return (
    <label className="block">
      {label}
      {multiline ? (
        <textarea className={inputClassName} value={value} onChange={(e) => onChange(e.target.value)} required />
      ) : (
        <input className={inputClassName} value={value} onChange={(e) => onChange(e.target.value)} required />
      )}
    </label>
  );
}

function AboutTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: AboutPageContent;
  onSave: (content: AboutPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField label="標語" value={draft.hero.eyebrow} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })} />
        <TextField label="標題" value={draft.hero.title} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })} />
        <TextField label="描述" value={draft.hero.description} multiline onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">我們的使命</legend>
        <TextField label="標語" value={draft.mission.eyebrow} onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, eyebrow: v } })} />
        <TextField label="標題" value={draft.mission.title} onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, title: v } })} />
        <TextField label="內文" value={draft.mission.body} multiline onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, body: v } })} />
        <TextField label="重點標籤" value={draft.mission.sideBadge} onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, sideBadge: v } })} />
        <TextField label="側邊文字" value={draft.mission.sideBody} multiline onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, sideBody: v } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">公開資料</legend>
        <TextField label="標語" value={draft.impact.eyebrow} onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, eyebrow: v } })} />
        <TextField label="標題" value={draft.impact.title} onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, title: v } })} />
        <TextField label="描述" value={draft.impact.description} multiline onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, description: v } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">四個重要步驟</legend>
        <TextField label="標語" value={draft.journey.eyebrow} onChange={(v) => setDraft({ ...draft, journey: { ...draft.journey, eyebrow: v } })} />
        <TextField label="標題" value={draft.journey.title} onChange={(v) => setDraft({ ...draft, journey: { ...draft.journey, title: v } })} />
        {draft.journey.steps.map((step, index) => (
          <div key={index} className="grid gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2">
            <TextField
              label={"步驟 " + (index + 1) + " 標題"}
              value={step.title}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], title: v };
                setDraft({ ...draft, journey: { ...draft.journey, steps } });
              }}
            />
            <TextField
              label={"步驟 " + (index + 1) + " 描述"}
              value={step.description}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], description: v };
                setDraft({ ...draft, journey: { ...draft.journey, steps } });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">CCCP 與 TNR 橫幅</legend>
        <TextField label="標語" value={draft.communityBand.eyebrow} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, eyebrow: v } })} />
        <TextField label="標題" value={draft.communityBand.title} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, title: v } })} />
        <TextField label="描述" value={draft.communityBand.description} multiline onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, description: v } })} />
        <TextField label="CCCP 卡片標題" value={draft.communityBand.cccpCard.title} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, cccpCard: { ...draft.communityBand.cccpCard, title: v } } })} />
        <TextField label="CCCP 卡片描述" value={draft.communityBand.cccpCard.description} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, cccpCard: { ...draft.communityBand.cccpCard, description: v } } })} />
        <TextField label="TNR 卡片標題" value={draft.communityBand.tnrCard.title} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, tnrCard: { ...draft.communityBand.tnrCard, title: v } } })} />
        <TextField label="TNR 卡片描述" value={draft.communityBand.tnrCard.description} onChange={(v) => setDraft({ ...draft, communityBand: { ...draft.communityBand, tnrCard: { ...draft.communityBand.tnrCard, description: v } } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">負責任領養</legend>
        <TextField label="標語" value={draft.responsibleAdoption.eyebrow} onChange={(v) => setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, eyebrow: v } })} />
        <TextField label="標題" value={draft.responsibleAdoption.title} onChange={(v) => setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, title: v } })} />
        <TextField label="內文" value={draft.responsibleAdoption.body} multiline onChange={(v) => setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, body: v } })} />
        <TextField label="連結文字" value={draft.responsibleAdoption.linkLabel} onChange={(v) => setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, linkLabel: v } })} />
        <TextField label="側邊標題" value={draft.responsibleAdoption.sideTitle} onChange={(v) => setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, sideTitle: v } })} />
        {draft.responsibleAdoption.principles.map((principle, index) => (
          <TextField
            key={index}
            label={"原則 " + (index + 1)}
            value={principle}
            onChange={(v) => {
              const principles = [...draft.responsibleAdoption.principles] as typeof draft.responsibleAdoption.principles;
              principles[index] = v;
              setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, principles } });
            }}
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">四種參與方式</legend>
        <TextField label="標語" value={draft.helpPaths.eyebrow} onChange={(v) => setDraft({ ...draft, helpPaths: { ...draft.helpPaths, eyebrow: v } })} />
        <TextField label="標題" value={draft.helpPaths.title} onChange={(v) => setDraft({ ...draft, helpPaths: { ...draft.helpPaths, title: v } })} />
        {draft.helpPaths.items.map((item, index) => (
          <div key={index} className="grid gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-3">
            <TextField
              label={"項目 " + (index + 1) + " 標題"}
              value={item.title}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], title: v };
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
            <TextField
              label={"項目 " + (index + 1) + " 描述"}
              value={item.description}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], description: v };
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
            <TextField
              label={"項目 " + (index + 1) + " 按鈕文字"}
              value={item.label}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], label: v };
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">結尾</legend>
        <TextField label="標題" value={draft.closing.title} onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, title: v } })} />
        <TextField label="描述" value={draft.closing.description} multiline onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, description: v } })} />
        <TextField label="按鈕文字" value={draft.closing.buttonLabel} onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, buttonLabel: v } })} />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}

function TnrTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: TnrPageContent;
  onSave: (content: TnrPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField label="標語" value={draft.hero.eyebrow} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })} />
        <TextField label="標題" value={draft.hero.title} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })} />
        <TextField label="描述" value={draft.hero.description} multiline onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">三個階段</legend>
        {draft.stages.map((stage, index) => (
          <div key={index} className="grid gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2">
            <TextField
              label={"階段 " + (index + 1) + " 標題"}
              value={stage.title}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], title: v };
                setDraft({ ...draft, stages });
              }}
            />
            <TextField
              label={"階段 " + (index + 1) + " 描述"}
              value={stage.description}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], description: v };
                setDraft({ ...draft, stages });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">社區參與</legend>
        <TextField label="標題" value={draft.chapter.title} onChange={(v) => setDraft({ ...draft, chapter: { ...draft.chapter, title: v } })} />
        <TextField label="描述" value={draft.chapter.description} multiline onChange={(v) => setDraft({ ...draft, chapter: { ...draft.chapter, description: v } })} />
        {draft.chapter.bullets.map((bullet, index) => (
          <TextField
            key={index}
            label={"重點 " + (index + 1)}
            value={bullet}
            onChange={(v) => {
              const bullets = [...draft.chapter.bullets] as typeof draft.chapter.bullets;
              bullets[index] = v;
              setDraft({ ...draft, chapter: { ...draft.chapter, bullets } });
            }}
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">行動呼籲</legend>
        <TextField label="標語" value={draft.cta.eyebrow} onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, eyebrow: v } })} />
        <TextField label="標題" value={draft.cta.title} onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, title: v } })} />
        <TextField
          label="描述前綴（會自動加上聯絡電郵）"
          value={draft.cta.descriptionPrefix}
          multiline
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, descriptionPrefix: v } })}
        />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}

function CccpTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: CccpPageContent;
  onSave: (content: CccpPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField label="標語" value={draft.hero.eyebrow} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })} />
        <TextField label="標題" value={draft.hero.title} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })} />
        <TextField label="描述" value={draft.hero.description} multiline onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })} />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">兩個章節</legend>
        {draft.chapters.map((chapter, index) => (
          <div key={index} className="border-t border-[var(--color-border)] pt-3">
            <TextField
              label={"章節 " + (index + 1) + " 標題"}
              value={chapter.title}
              onChange={(v) => {
                const chapters = [...draft.chapters] as typeof draft.chapters;
                chapters[index] = { ...chapters[index], title: v };
                setDraft({ ...draft, chapters });
              }}
            />
            <TextField
              label={"章節 " + (index + 1) + " 描述"}
              value={chapter.description}
              multiline
              onChange={(v) => {
                const chapters = [...draft.chapters] as typeof draft.chapters;
                chapters[index] = { ...chapters[index], description: v };
                setDraft({ ...draft, chapters });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">工作方式表格</legend>
        <TextField label="表格標題" value={draft.workSectionTitle} onChange={(v) => setDraft({ ...draft, workSectionTitle: v })} />
        {draft.workRows.map((row, index) => (
          <div key={index} className="grid gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-3">
            <TextField
              label={"列 " + (index + 1) + " 工作範圍"}
              value={row.scope}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], scope: v };
                setDraft({ ...draft, workRows });
              }}
            />
            <TextField
              label={"列 " + (index + 1) + " 社區做法"}
              value={row.method}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], method: v };
                setDraft({ ...draft, workRows });
              }}
            />
            <TextField
              label={"列 " + (index + 1) + " 動物福利結果"}
              value={row.result}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], result: v };
                setDraft({ ...draft, workRows });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">行動呼籲</legend>
        <TextField label="標語" value={draft.cta.eyebrow} onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, eyebrow: v } })} />
        <TextField label="標題" value={draft.cta.title} onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, title: v } })} />
        <TextField label="描述" value={draft.cta.description} multiline onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, description: v } })} />
        {draft.cta.points.map((point, index) => (
          <TextField
            key={index}
            label={"重點 " + (index + 1)}
            value={point}
            onChange={(v) => {
              const points = [...draft.cta.points] as typeof draft.cta.points;
              points[index] = v;
              setDraft({ ...draft, cta: { ...draft.cta, points } });
            }}
          />
        ))}
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}
```

- [ ] **Step 2: Write `AboutPagesManagement.test.tsx`**

```tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AboutPagesManagementView } from "./AboutPagesManagement";

const about = {
  hero: { eyebrow: "e", title: "領養代替購買", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

const tnr = {
  hero: { eyebrow: "e", title: "TNR 捕捉絕育放回", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

const cccp = {
  hero: { eyebrow: "e", title: "CCCP 社區貓照顧計劃", description: "d" },
  chapters: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
  ],
  workRows: [
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
  ],
  workSectionTitle: "w",
  cta: { eyebrow: "e", title: "t", description: "d", points: ["1", "2", "3"] },
};

describe("AboutPagesManagementView", () => {
  test("renders the About tab's fields when active", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="about"
        onTabChange={() => {}}
        data={{ about, tnr, cccp }}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );
    expect(markup).toContain('value="領養代替購買"');
    expect(markup).not.toContain('value="TNR 捕捉絕育放回"');
  });

  test("renders the TNR tab's fields when active", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="tnr"
        onTabChange={() => {}}
        data={{ about, tnr, cccp }}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );
    expect(markup).toContain('value="TNR 捕捉絕育放回"');
  });

  test("renders the CCCP tab's fields when active", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="cccp"
        onTabChange={() => {}}
        data={{ about, tnr, cccp }}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );
    expect(markup).toContain('value="CCCP 社區貓照顧計劃"');
  });

  test("shows the save-error message when isSaveError is true", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="about"
        onTabChange={() => {}}
        data={{ about, tnr, cccp }}
        onSave={() => {}}
        isSaving={false}
        isSaveError={true}
      />,
    );
    expect(markup).toContain("儲存失敗");
  });
});
```

- [ ] **Step 3: Write the admin route**

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AboutPagesManagement } from "../../../components/admin/content/AboutPagesManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/about")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminAboutPagesPage,
});

export function AdminAboutPagesPage() {
  return (
    <AdminLayout activeSection="content">
      <AboutPagesManagement />
    </AdminLayout>
  );
}
```

Save as `src/routes/admin/content/about.tsx`.

- [ ] **Step 4: Run the tests**

Run: `bun test src/components/admin/content/AboutPagesManagement.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors — this also confirms `routeTree.gen.ts` doesn't need manual edits (TanStack Router's dev/build step regenerates it; if typecheck complains about the new route not being in the generated tree, run `bun run dev` briefly to regenerate it, then stop it and re-run typecheck).

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/content/AboutPagesManagement.tsx src/components/admin/content/AboutPagesManagement.test.tsx src/routes/admin/content/about.tsx
git commit -m "feat: add the About Pages admin management UI"
```

---

### Task 11: Admin nav item and bilingual copy

**Files:**
- Modify: `src/components/admin/adminNav.ts`
- Modify: `src/components/admin/adminI18n.tsx`

This is a single task specifically so the nav item and its bilingual copy land in the same commit — Task 8 of the prior feature (adoption rules & care topics) hit a real bug where these were split across commits and the English admin UI silently fell back to Chinese text for four commits before anyone noticed.

- [ ] **Step 1: Add the nav item**

Add `FileText` to the `lucide-react` import at the top of `src/components/admin/adminNav.ts`:

```ts
import {
  BarChart3,
  Banknote,
  CalendarDays,
  ClipboardPenLine,
  Cat,
  ClipboardList,
  Dog,
  FilePlus2,
  FileText,
  HandCoins,
  HelpCircle,
  Heart,
  Inbox,
  ListTodo,
  Megaphone,
  ShieldCheck,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
```

Then add a new nav entry right after the `faq` entry:

```ts
  {
    id: "faq",
    section: "content",
    group: "promotion",
    label: "常見問題",
    icon: HelpCircle,
    to: "/admin/faq",
    activePath: "/admin/faq",
  },
  {
    id: "about-pages",
    section: "content",
    group: "promotion",
    label: "關於頁面",
    icon: FileText,
    to: "/admin/content/about",
    activePath: "/admin/content/about",
  },
```

- [ ] **Step 2: Add the bilingual copy**

In `src/components/admin/adminI18n.tsx`, find the zh `navItems` block (the one containing `faq: "常見問題",`) and add right after it:

```ts
      faq: "常見問題",
      "about-pages": "關於頁面",
```

Find the matching en `navItems` block (`faq: "FAQ",`) and add right after it:

```ts
      faq: "FAQ",
      "about-pages": "About Pages",
```

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: all pass, no new failures (this domain has no direct test coverage of `adminNav.ts`/`adminI18n.tsx` content, but this confirms nothing else broke).

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/adminNav.ts src/components/admin/adminI18n.tsx
git commit -m "feat: add About Pages nav item with bilingual copy"
```

---

### Task 12: Full verification gate and draft PR

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all tests pass, including every new file from Tasks 1-11.

- [ ] **Step 2: Run the full lint**

Run: `bun run lint`
Expected: 0 errors (pre-existing warnings in unrelated files are fine — do not fix those, they're out of scope).

- [ ] **Step 3: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 5: Manually verify the three public pages still render correctly**

Since this plan changes 3 public-facing pages, don't rely on tests alone — run the dev server and visually check each page renders exactly as it did before (this is the whole point of the fallback-to-default design: verify it actually holds).

```bash
bun run dev
```

Visit `/about`, `/about/tnr`, `/about/cccp` in a browser. Compare against `git show main:src/routes/about/index.tsx` etc. if anything looks different. Stop the dev server when done.

- [ ] **Step 6: Push and open a draft PR**

```bash
git push -u origin docs/about-pages-content-cms-design
gh pr create --draft --title "feat: add About Pages Content CMS" --body "$(cat <<'EOF'
## Summary
- Moves hardcoded zh-HK marketing/mission copy on /about, /about/tnr, /about/cccp into a new admin-editable `aboutPages` domain.
- New table `about_page_content` (one row per page, `content jsonb`, no draft/publish state — edits go live immediately) + one shared `security definer` RPC.
- Fixed-shape per-page Zod schemas — no free CRUD, array lengths (4 journey steps, 3 TNR stages, etc.) stay fixed.
- zh-HK only — these pages have no English content today.
- New admin UI at /admin/content/about (About / TNR / CCCP tabs).
- Every public route falls back to a hardcoded default identical to today's copy if a row is missing, so this ships with zero visual change.
- Closes out "BP-3 remainder" (after FAQ CMS #84 and Adoption Rules & Care Topics CMS #85).

Spec: docs/superpowers/specs/2026-08-30-about-pages-content-cms-design.md
Plan: docs/superpowers/plans/2026-08-30-about-pages-content-cms.md

## Test plan
- [x] `bun test` — full suite passes
- [x] `bun run lint` — 0 errors
- [x] `bunx tsc --noEmit` — clean
- [x] `bun run build` — succeeds
- [x] Migration verified against a real Postgres container (RPC + audit_log insert both confirmed)
- [x] Manually verified /about, /about/tnr, /about/cccp render unchanged in dev

**Not yet applied to the live database** (project ref `iihqjzilgawhfdhdevam`) — the migration must be applied in the same deploy window as this PR's merge.

Wait for the tech lead's review. Do not merge.
EOF
)"
```

- [ ] **Step 7: Report the PR URL and stop**

This plan's terminal state is an open draft PR awaiting review — do not merge, matching the pattern from PR #84/#85.
