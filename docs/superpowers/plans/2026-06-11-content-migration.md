# HKSCDA Content Migration & Dynamic Animal System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 9 pages from hkscda.com into the TanStack Start site and add a Supabase-backed animal listing system with pagination, detail pages, adoption form, and admin panel.

**Architecture:** Static content pages are plain React components with hardcoded Traditional Chinese text. Dynamic animal pages use TanStack Query + Supabase client for data fetching, with file-based TanStack Router routes. The admin panel is protected by Supabase Auth session checks in `beforeLoad`.

**Tech Stack:** TanStack Start (SSR), TanStack Router (file-based), TanStack Query, Supabase (PostgreSQL + Auth + Storage), react-hook-form + zod, Radix UI NavigationMenu, Resend (email), Tailwind CSS v4, Bun

---

## File Map

### New files to create

```
src/lib/supabase.ts                          — Supabase client singleton
src/types/animal.ts                          — Animal, AdoptionApplication TS types

src/components/site/AnimalCard.tsx           — Card component (photo, name, tags, CTA)
src/components/site/AnimalGrid.tsx           — Grid + age filter tabs + pagination
src/components/site/AnimalDetail.tsx         — Two-column detail layout (shared cat/dog/sponsor)

src/components/admin/AdminLayout.tsx         — Dark sidebar wrapper
src/components/admin/AnimalForm.tsx          — Add/edit form (react-hook-form + zod)
src/components/admin/AnimalsTable.tsx        — Data table with search + status badges

src/lib/api/submit-application.functions.ts  — createServerFn: Supabase insert + Resend email

src/routes/about/index.tsx                   — /about
src/routes/about/cccp.tsx                    — /about/cccp
src/routes/about/tnr.tsx                     — /about/tnr
src/routes/about/team.tsx                    — /about/team
src/routes/about/privacy.tsx                 — /about/privacy
src/routes/adoption/instructions.tsx         — /adoption/instructions
src/routes/adoption/apply.tsx                — /adoption/apply (form)
src/routes/animals/cat.tsx                   — /animals/cat listing
src/routes/animals/dog.tsx                   — /animals/dog listing
src/routes/animals/cat_.$id.tsx              — /animals/cat/$id detail
src/routes/animals/dog_.$id.tsx              — /animals/dog/$id detail
src/routes/sponsors.tsx                      — /sponsors listing
src/routes/sponsors_.$id.tsx                 — /sponsors/$id detail
src/routes/admin/login.tsx                   — /admin/login
src/routes/admin/index.tsx                   — /admin dashboard
src/routes/admin/animals/new.tsx             — /admin/animals/new
src/routes/admin/animals/$id.edit.tsx        — /admin/animals/$id/edit
```

### Files to modify

```
src/components/site/Header.tsx               — Replace anchor hrefs with <Link>, add Radix dropdowns
```

---

## Phase 1: Foundation

### Task 1: Install dependencies + environment setup

**Files:**

- Modify: `package.json` (via bun add)
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Install Supabase and Resend**

```bash
cd /path/to/hkscda
bun add @supabase/supabase-js resend
```

Expected: both packages appear in `package.json` dependencies.

- [ ] **Step 2: Create `.env.local`**

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
RESEND_API_KEY=re_YOUR_KEY
NOTIFICATION_EMAIL=adoption@hkscda.com
```

Replace placeholders with real values from Supabase project settings and Resend dashboard.

- [ ] **Step 3: Verify `.env.local` is gitignored**

```bash
grep '.env.local' .gitignore
```

Expected: `.env.local` appears. If not, add it.

---

### Task 2: Supabase schema via MCP

**Files:** (Supabase project, no local files)

- [ ] **Step 1: Create `animals` table**

Run via Supabase MCP `apply_migration` with this SQL:

```sql
create table animals (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null check (type in ('cat', 'dog', 'sponsor')),
  name        text        not null,
  name_en     text,
  gender      text        not null check (gender in ('male', 'female')),
  age         text        not null,
  description text,
  notes       text,
  status      text        not null default 'available'
                          check (status in ('available', 'adopted', 'fostered')),
  image_url   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table animals enable row level security;

create policy "public read available"
  on animals for select
  using (status = 'available');

create policy "admin full access"
  on animals for all
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Create `adoption_applications` table**

```sql
create table adoption_applications (
  id             uuid        primary key default gen_random_uuid(),
  animal_id      uuid        references animals(id),
  animal_name    text        not null,
  animal_type    text        not null,
  applicant_name text        not null,
  phone          text        not null,
  email          text        not null,
  address        text        not null,
  housing_type   text        not null,
  family_size    integer,
  existing_pets  text,
  reason         text        not null,
  status         text        not null default 'pending'
                             check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz default now()
);

alter table adoption_applications enable row level security;

create policy "admin only"
  on adoption_applications for all
  using (auth.role() = 'authenticated');

create policy "public insert"
  on adoption_applications for insert
  with check (true);
```

- [ ] **Step 3: Create `animal-images` storage bucket**

In Supabase dashboard: Storage → New bucket → name: `animal-images`, Public: ON.

Add storage policy:

```sql
-- authenticated users can upload
create policy "admin upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'animal-images');
```

---

### Task 3: Supabase client + TypeScript types

**Files:**

- Create: `src/lib/supabase.ts`
- Create: `src/types/animal.ts`

- [ ] **Step 1: Create Supabase client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
```

- [ ] **Step 2: Create TypeScript types**

Create `src/types/animal.ts`:

```ts
export type AnimalType = "cat" | "dog" | "sponsor";
export type AnimalStatus = "available" | "adopted" | "fostered";
export type AgeFilter = "all" | "bb" | "adult" | "senior";
export type HousingType = "私人樓宇" | "居屋" | "公屋" | "村屋" | "其他";

export interface Animal {
  id: string;
  type: AnimalType;
  name: string;
  name_en: string | null;
  gender: "male" | "female";
  age: string;
  description: string | null;
  notes: string | null;
  status: AnimalStatus;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdoptionApplication {
  id: string;
  animal_id: string | null;
  animal_name: string;
  animal_type: string;
  applicant_name: string;
  phone: string;
  email: string;
  address: string;
  housing_type: HousingType;
  family_size: number | null;
  existing_pets: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function parseAgeFilter(age: string): AgeFilter {
  if (age.includes("個月")) return "bb";
  const match = age.match(/(\d+)/);
  if (!match) return "adult";
  const years = parseInt(match[1], 10);
  if (years < 1) return "bb";
  if (years <= 7) return "adult";
  return "senior";
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts src/types/animal.ts
git commit -m "feat: add Supabase client and Animal/AdoptionApplication types"
```

---

### Task 4: Header navigation refactor

**Files:**

- Modify: `src/components/site/Header.tsx`

- [ ] **Step 1: Read current Header**

```bash
cat src/components/site/Header.tsx
```

- [ ] **Step 2: Replace with Radix NavigationMenu + TanStack Router Links**

Replace the entire file content with:

```tsx
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        <Link to="/" className="font-display font-bold text-lg text-[var(--color-primary)]">
          🐾 HKSCDA
        </Link>

        {/* Desktop nav */}
        <NavigationMenu.Root className="hidden md:flex">
          <NavigationMenu.List className="flex items-center gap-1">
            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/"
                  className="px-3 py-2 text-sm hover:text-[var(--color-primary)] transition-colors"
                >
                  主頁
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Trigger className="px-3 py-2 text-sm hover:text-[var(--color-primary)] transition-colors flex items-center gap-1">
                關於協會 <span className="text-xs">▾</span>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="absolute top-full left-0 mt-1 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1">
                <NavigationMenu.Link asChild>
                  <Link
                    to="/about"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    協會簡介
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/about/cccp"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    CCCP計劃
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/about/tnr"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    TNR計劃
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/about/team"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    團隊
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/about/privacy"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    私隱聲明
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Trigger className="px-3 py-2 text-sm hover:text-[var(--color-primary)] transition-colors flex items-center gap-1">
                領養 <span className="text-xs">▾</span>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="absolute top-full left-0 mt-1 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1">
                <NavigationMenu.Link asChild>
                  <Link
                    to="/adoption/instructions"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    領養需知
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/animals/cat"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    待領養貓貓
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/animals/dog"
                    className="block px-4 py-2 text-sm hover:bg-[var(--color-surface-offset)]"
                  >
                    待領養狗狗
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/sponsors"
                  className="px-3 py-2 text-sm hover:text-[var(--color-primary)] transition-colors"
                >
                  助養區
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <a
                  href="/#donate"
                  className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-full hover:bg-[var(--color-primary-hover)] transition-colors"
                >
                  💛 立即捐助
                </a>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Viewport className="absolute top-full left-0 w-full" />
        </NavigationMenu.Root>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 space-y-1">
          <Link to="/" onClick={() => setMobileOpen(false)} className="block py-2 text-sm">
            主頁
          </Link>
          <div className="text-xs font-semibold text-[var(--color-text-muted)] pt-2 pb-1">
            關於協會
          </div>
          <Link
            to="/about"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            協會簡介
          </Link>
          <Link
            to="/about/cccp"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            CCCP計劃
          </Link>
          <Link
            to="/about/tnr"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            TNR計劃
          </Link>
          <Link
            to="/about/team"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            團隊
          </Link>
          <Link
            to="/about/privacy"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            私隱聲明
          </Link>
          <div className="text-xs font-semibold text-[var(--color-text-muted)] pt-2 pb-1">領養</div>
          <Link
            to="/adoption/instructions"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            領養需知
          </Link>
          <Link
            to="/animals/cat"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            待領養貓貓
          </Link>
          <Link
            to="/animals/dog"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm pl-3"
          >
            待領養狗狗
          </Link>
          <Link to="/sponsors" onClick={() => setMobileOpen(false)} className="block py-2 text-sm">
            助養區
          </Link>
          <a
            href="/#donate"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-[var(--color-primary)]"
          >
            💛 立即捐助
          </a>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Run dev server and verify nav renders**

```bash
bun run dev
```

Open `http://localhost:3000`. Confirm desktop dropdown menus appear. Confirm mobile hamburger opens flat list.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/Header.tsx
git commit -m "feat: refactor header to Radix NavigationMenu with TanStack Router Links"
```

---

## Phase 2: Static Content Pages

### Task 5: /about page

**Files:**

- Create: `src/routes/about/index.tsx`

- [ ] **Step 1: Create the route file**

Create `src/routes/about/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold text-[var(--color-text)]">協會簡介</h1>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">關於香港拯救貓狗協會</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          香港拯救貓狗協會（HKSCDA）是一個非牟利慈善團體，致力於拯救、照顧及為流浪及被遺棄的貓狗尋找領養家庭。
          協會成立以來，已協助數以百計的動物重獲新生，在愛心義工及捐助者的支持下持續運作。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">協會宗旨</h2>
        <ul className="space-y-2 list-none">
          {[
            "拯救流浪及被遺棄的貓狗",
            "提供臨時住所及醫療照顧",
            "推廣負責任的寵物主人文化",
            "協助動物尋找永久愛心家庭",
            "推行絕育計劃減少流浪動物數目",
            "提高社會人士對動物福利的關注",
            "與政府及其他動物福利機構合作",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[var(--color-text-muted)]">
              <span className="text-[var(--color-primary)] mt-1">•</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">主要工作</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會主要工作包括：拯救行動、醫療救治、義工招募、領養配對、CCCP社區貓照顧計劃及TNR（誘捕-絕育-放回）計劃。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">貓舍及狗舍</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會設有貓舍及狗舍，為等待領養的動物提供安全舒適的居住環境，
          動物在等待領養期間均獲得適當的食物、醫療及社交化訓練。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">收費表</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-offset)]">
                <th className="text-left p-3 border border-[var(--color-border)]">服務</th>
                <th className="text-left p-3 border border-[var(--color-border)]">貓</th>
                <th className="text-left p-3 border border-[var(--color-border)]">狗</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["領養費", "HK$800", "HK$1,000"],
                ["絕育手術（已包含在領養費內）", "✓", "✓"],
                ["晶片及疫苗（已包含在領養費內）", "✓", "✓"],
              ].map(([service, cat, dog]) => (
                <tr key={service} className="border-b border-[var(--color-border)]">
                  <td className="p-3 border border-[var(--color-border)]">{service}</td>
                  <td className="p-3 border border-[var(--color-border)]">{cat}</td>
                  <td className="p-3 border border-[var(--color-border)]">{dog}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify route appears**

```bash
bun run dev
```

Visit `http://localhost:3000/about`. Page should render with all sections.

- [ ] **Step 3: Commit**

```bash
git add src/routes/about/index.tsx
git commit -m "feat: add /about static page"
```

---

### Task 6: /about/cccp, /about/tnr, /about/team, /about/privacy

**Files:**

- Create: `src/routes/about/cccp.tsx`
- Create: `src/routes/about/tnr.tsx`
- Create: `src/routes/about/team.tsx`
- Create: `src/routes/about/privacy.tsx`

- [ ] **Step 1: Create CCCP page**

Create `src/routes/about/cccp.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/cccp")({
  component: CCCPPage,
});

function CCCPPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">CCCP計劃</h1>
      <p className="text-[var(--color-text-muted)] text-lg">
        社區貓照顧計劃（Community Cat Care Program）
      </p>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">什麼是CCCP？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          CCCP（社區貓照顧計劃）是香港拯救貓狗協會推行的社區流浪貓管理計劃。
          計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合TNR絕育計劃，
          逐步減少社區內流浪貓的數目，改善貓隻的生活質素。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">為何需要CCCP？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          香港有大量流浪貓生活在社區內。若缺乏妥善管理，流浪貓可能受到傷害、感染疾病或引起鄰里衝突。
          CCCP提供一個有系統的方法，讓社區居民與流浪貓和諧共存。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">CCCP vs 傳統方式對比</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-offset)]">
                <th className="p-3 border border-[var(--color-border)] text-left">項目</th>
                <th className="p-3 border border-[var(--color-border)] text-left">傳統方式</th>
                <th className="p-3 border border-[var(--color-border)] text-left">CCCP方式</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["貓隻管理", "移除/撲殺", "原地絕育照顧"],
                ["貓隻數目", "短期減少，長期回升", "逐步穩定減少"],
                ["社區衝突", "頻繁", "顯著減少"],
                ["動物福利", "低", "高"],
                ["費用效益", "持續高費用", "一次性投入，長期效益"],
              ].map(([item, traditional, cccp]) => (
                <tr key={item}>
                  <td className="p-3 border border-[var(--color-border)] font-medium">{item}</td>
                  <td className="p-3 border border-[var(--color-border)] text-red-600">
                    {traditional}
                  </td>
                  <td className="p-3 border border-[var(--color-border)] text-green-600">{cccp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">每月運作</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          義工每日定時為指定地區的流浪貓提供食物及清水，定期記錄貓隻狀況，
          並配合TNR計劃安排未絕育貓隻進行手術。協會定期舉辦義工培訓，
          確保所有參與者具備正確的護理知識。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">如何支持CCCP</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          您可以透過擔任義工、捐款或捐贈物資支持CCCP計劃。 如有興趣參與，請透過協會電郵聯絡我們。
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Create TNR page**

Create `src/routes/about/tnr.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/tnr")({
  component: TNRPage,
});

function TNRPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">TNR計劃</h1>
      <p className="text-[var(--color-text-muted)] text-lg">誘捕—絕育—放回（Trap-Neuter-Return）</p>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">什麼是TNR？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          TNR是目前國際公認最有效管理流浪貓數目的人道方法。研究顯示，
          若一個地區有超過70%的流浪貓完成絕育，該地區的流浪貓數目將逐漸自然減少。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">TNR三個階段</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "誘捕 Trap",
              icon: "🪤",
              desc: "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。",
            },
            {
              step: "2",
              title: "絕育 Neuter",
              icon: "🏥",
              desc: "將捕捉到的貓送往合作獸醫診所進行絕育手術，同時進行基本健康檢查及注射疫苗。",
            },
            {
              step: "3",
              title: "放回 Return",
              icon: "🏠",
              desc: "手術後在原地放回，耳尖剪作識別記號，繼續由CCCP義工照顧。",
            },
          ].map(({ step, title, icon, desc }) => (
            <div key={step} className="bg-[var(--color-surface-offset)] rounded-xl p-5 space-y-2">
              <div className="text-3xl">{icon}</div>
              <div className="font-bold text-[var(--color-primary)]">第{step}步</div>
              <div className="font-semibold">{title}</div>
              <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">沒有TNR的情況</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          若缺乏TNR介入，流浪貓群落會持續繁殖，數目不斷上升。
          大量流浪貓可能引致社區衛生問題、鄰里衝突，
          同時增加捕捉安樂死的開支。TNR是更人道、更有效的長期解決方案。
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Create Team page**

Create `src/routes/about/team.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/team")({
  component: TeamPage,
});

function TeamPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">團隊</h1>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">董事會</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { role: "主席", name: "謝曉梅女士", desc: "帶領協會多年，致力推動香港動物福利發展。" },
            { role: "名譽主席", name: "鄧殷女士", desc: "支持協會工作，積極推廣動物友善社區。" },
          ].map(({ role, name, desc }) => (
            <div key={name} className="bg-[var(--color-surface-offset)] rounded-xl p-6 space-y-2">
              <div className="text-sm text-[var(--color-primary)] font-semibold">{role}</div>
              <div className="font-display text-lg font-bold">{name}</div>
              <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">義工團隊</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會有一群熱心的義工，定期參與喂飼、清潔貓舍狗舍、協助領養配對及活動籌辦等工作。
          如有興趣加入義工行列，歡迎透過電郵聯絡我們。
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Create Privacy page**

Create `src/routes/about/privacy.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <h1 className="font-display text-3xl font-bold">私隱聲明</h1>
      <p className="text-[var(--color-text-muted)]">最後更新：2024年</p>

      {[
        {
          title: "1. 個人資料的收集",
          content: `香港拯救貓狗協會（「協會」）可能收集您的個人資料，包括姓名、聯絡電話、電郵地址及住址等，
            以處理領養申請、接受捐款及提供相關服務。我們只會收集所需的最少個人資料。`,
        },
        {
          title: "2. 個人資料的使用",
          content: `您的個人資料將只用於：處理您的領養或助養申請；與您聯絡有關您的申請事宜；
            如您同意，向您發送協會的最新消息及活動資訊。我們不會將您的個人資料出售或出租予第三方。`,
        },
        {
          title: "3. 個人資料的安全",
          content: `協會採取合理措施保護您的個人資料，防止未經授權的存取、披露、複製、使用或修改。
            所有個人資料均儲存在安全的系統內。`,
        },
        {
          title: "4. 個人資料的披露",
          content: `在以下情況下，協會可能需要披露您的個人資料：根據法律規定；為保護協會的合法權益；
            獲得您的事先同意。`,
        },
        {
          title: "5. 個人資料的保留",
          content: `協會只會在達到收集目的所需的期限內保留您的個人資料，
            或根據適用法律規定的保留期限內保留。`,
        },
        {
          title: "6. 查閱及更正權利",
          content: `根據《個人資料（私隱）條例》，您有權查閱及更正我們持有的您的個人資料。
            如需提出要求，請電郵至協會的聯絡電郵。`,
        },
      ].map(({ title, content }) => (
        <section key={title} className="space-y-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <p className="text-[var(--color-text-muted)] leading-relaxed">{content}</p>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Verify all four routes**

```bash
bun run dev
```

Visit `/about/cccp`, `/about/tnr`, `/about/team`, `/about/privacy`. Each should render without errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/about/cccp.tsx src/routes/about/tnr.tsx src/routes/about/team.tsx src/routes/about/privacy.tsx
git commit -m "feat: add /about/cccp, /about/tnr, /about/team, /about/privacy static pages"
```

---

### Task 7: /adoption/instructions page

**Files:**

- Create: `src/routes/adoption/instructions.tsx`

- [ ] **Step 1: Create the route**

Create `src/routes/adoption/instructions.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import * as Tabs from "@radix-ui/react-tabs";

export const Route = createFileRoute("/adoption/instructions")({
  component: InstructionsPage,
});

const adoptionRules = [
  "申請人須年滿18歲，並持有香港居留權或工作證。",
  "申請人須提供真實個人資料及住址，以便協會進行家訪。",
  "領養前須繳付領養費（貓：HK$800；狗：HK$1,000），費用包括絕育、晶片及疫苗。",
  "領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。",
  "須確保動物生活在安全、舒適的室內環境。",
  "須定期帶動物進行健康檢查及接種疫苗。",
  "如住所為租住單位，須提供業主同意飼養寵物的書面証明。",
  "申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。",
  "每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。",
  "申請人須了解並接受動物的生理及行為特性，有耐心照顧。",
  "領養後如動物出現健康問題，須立即尋求獸醫協助。",
  "協會保留拒絕不合適申請的權利，並無需解釋原因。",
];

const catCareTopics = [
  {
    value: "home",
    label: "家居",
    content:
      "為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。",
  },
  {
    value: "collection",
    label: "領取",
    content:
      "領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。",
  },
  {
    value: "food",
    label: "糧食",
    content:
      "提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。",
  },
  {
    value: "cleaning",
    label: "清潔",
    content: "每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。",
  },
  {
    value: "health",
    label: "保健",
    content:
      "每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。",
  },
  {
    value: "supplies",
    label: "用品",
    content: "必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。",
  },
  {
    value: "window",
    label: "安窗",
    content:
      "必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。",
  },
];

const dogCareTopics = [
  {
    value: "home",
    label: "家居",
    content: "為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。",
  },
  {
    value: "collection",
    label: "領取",
    content: "領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。",
  },
  {
    value: "food",
    label: "食物",
    content:
      "提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。",
  },
  {
    value: "rest",
    label: "休息",
    content: "為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。",
  },
  {
    value: "cleaning",
    label: "清潔",
    content: "定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。",
  },
  {
    value: "health",
    label: "保健",
    content: "每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。",
  },
  {
    value: "walk",
    label: "溜狗",
    content:
      "每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。",
  },
  {
    value: "training",
    label: "教育",
    content:
      "盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。",
  },
];

function InstructionsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
      <h1 className="font-display text-3xl font-bold">領養需知</h1>

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
                className="px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-cat)] data-[state=active]:text-[var(--color-cat)] text-[var(--color-text-muted)]"
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
                className="px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-dog)] data-[state=active]:text-[var(--color-dog)] text-[var(--color-text-muted)]"
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
    </main>
  );
}
```

- [ ] **Step 2: Verify**

```bash
bun run dev
```

Visit `http://localhost:3000/adoption/instructions`. Tabs should switch content.

- [ ] **Step 3: Commit**

```bash
git add src/routes/adoption/instructions.tsx
git commit -m "feat: add /adoption/instructions with tabbed care guides"
```

---

## Phase 3: Animal System — Shared Components

### Task 8: AnimalCard component

**Files:**

- Create: `src/components/site/AnimalCard.tsx`

- [ ] **Step 1: Create AnimalCard**

Create `src/components/site/AnimalCard.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import type { Animal } from "../../types/animal";

interface AnimalCardProps {
  animal: Animal;
}

export function AnimalCard({ animal }: AnimalCardProps) {
  const detailHref =
    animal.type === "sponsor" ? `/sponsors/${animal.id}` : `/animals/${animal.type}/${animal.id}`;

  const ctaLabel = animal.type === "sponsor" ? "立即助養" : "申請領養";

  const placeholder = animal.type === "dog" ? "🐶" : "🐱";
  const placeholderBg = animal.type === "dog" ? "var(--color-dog-bg)" : "var(--color-cat-bg)";

  return (
    <div className="bg-[var(--color-surface)] rounded-xl overflow-hidden border border-[var(--color-border)] flex flex-col hover:shadow-md transition-shadow">
      <Link to={detailHref} className="block">
        {animal.image_url ? (
          <img
            src={animal.image_url}
            alt={animal.name}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div
            className="w-full aspect-square flex items-center justify-center text-5xl"
            style={{ background: placeholderBg }}
          >
            {placeholder}
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="font-semibold text-[var(--color-text)]">{animal.name}</div>

        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.gender === "male" ? "公" : "母"}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.age}
          </span>
          {animal.notes && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
              {animal.notes}
            </span>
          )}
        </div>

        <Link
          to={detailHref}
          className="mt-auto text-center text-xs py-1.5 px-3 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors"
        >
          {ctaLabel} →
        </Link>
      </div>
    </div>
  );
}
```

---

### Task 9: AnimalGrid component

**Files:**

- Create: `src/components/site/AnimalGrid.tsx`

- [ ] **Step 1: Create AnimalGrid**

Create `src/components/site/AnimalGrid.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AnimalCard } from "./AnimalCard";
import type { Animal, AgeFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";

interface AnimalGridProps {
  animals: Animal[];
  total: number;
  page: number;
  ageFilter: AgeFilter;
  pageSize?: number;
  animalLabel?: string;
}

const AGE_TABS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "bb", label: "BB" },
  { value: "adult", label: "成" },
  { value: "senior", label: "老" },
];

export function AnimalGrid({
  animals,
  total,
  page,
  ageFilter,
  pageSize = 16,
  animalLabel = "動物",
}: AnimalGridProps) {
  const navigate = useNavigate();
  const totalPages = Math.ceil(total / pageSize);

  const filtered =
    ageFilter === "all" ? animals : animals.filter((a) => parseAgeFilter(a.age) === ageFilter);

  function setFilter(f: AgeFilter) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, filter: f, page: 1 }) });
  }

  function setPage(p: number) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, page: p }) });
  }

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {AGE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              ageFilter === tab.value
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-[var(--color-text-muted)] self-center">
          共 {total} 隻{animalLabel}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-[var(--color-text-muted)]">
          暫時沒有符合條件的{animalLabel}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 pt-4">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded text-sm disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            ←
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1.5 rounded text-sm ${
                p === page
                  ? "bg-[var(--color-primary)] text-white"
                  : "hover:bg-[var(--color-surface-offset)]"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded text-sm disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
```

---

### Task 10: AnimalDetail component

**Files:**

- Create: `src/components/site/AnimalDetail.tsx`

- [ ] **Step 1: Create AnimalDetail**

Create `src/components/site/AnimalDetail.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import type { Animal } from "../../types/animal";

interface AnimalDetailProps {
  animal: Animal;
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const ctaLabel = animal.type === "sponsor" ? "立即助養" : "申請領養";
  const applyHref = `/adoption/apply?animalId=${animal.id}&animalName=${encodeURIComponent(animal.name)}&type=${animal.type}`;
  const placeholder = animal.type === "dog" ? "🐶" : "🐱";
  const placeholderBg = animal.type === "dog" ? "var(--color-dog-bg)" : "var(--color-cat-bg)";

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link
        to={backHref}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1"
      >
        ← {backLabel}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Photo */}
        <div className="rounded-2xl overflow-hidden">
          {animal.image_url ? (
            <img
              src={animal.image_url}
              alt={animal.name}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div
              className="w-full aspect-square flex items-center justify-center text-[100px]"
              style={{ background: placeholderBg }}
            >
              {placeholder}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-bold">{animal.name}</h1>
          {animal.name_en && <p className="text-[var(--color-text-muted)]">{animal.name_en}</p>}

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.gender === "male" ? "公" : "母"}
            </span>
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.age}
            </span>
            {animal.notes && (
              <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
                {animal.notes}
              </span>
            )}
          </div>

          {animal.description && (
            <p className="text-[var(--color-text-muted)] leading-relaxed">{animal.description}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Link
              to={applyHref}
              className="text-center py-3 rounded-full bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              📩 {ctaLabel}
            </Link>
            <Link
              to={backHref}
              className="text-center py-3 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
            >
              ← {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit shared components**

```bash
git add src/components/site/AnimalCard.tsx src/components/site/AnimalGrid.tsx src/components/site/AnimalDetail.tsx
git commit -m "feat: add AnimalCard, AnimalGrid, AnimalDetail shared components"
```

---

## Phase 3 (cont.): Animal Listing + Detail Routes

### Task 11: Cat listing + detail routes

**Files:**

- Create: `src/routes/animals/cat.tsx`
- Create: `src/routes/animals/cat_.$id.tsx`

- [ ] **Step 1: Create cat listing route**

Create `src/routes/animals/cat.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AnimalGrid } from "../../components/site/AnimalGrid";
import type { AgeFilter } from "../../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/animals/cat")({
  validateSearch: searchSchema,
  component: CatListingPage,
});

function CatListingPage() {
  const { page, filter } = Route.useSearch();

  const { data, isLoading } = useQuery({
    queryKey: ["animals", "cat", page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("animals")
        .select("*", { count: "exact" })
        .eq("type", "cat")
        .eq("status", "available")
        .range(from, to);
      if (error) throw error;
      return { animals: data ?? [], total: count ?? 0 };
    },
  });

  if (isLoading)
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">
        載入中…
      </div>
    );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">待領養貓貓</h1>
      <AnimalGrid
        animals={data?.animals ?? []}
        total={data?.total ?? 0}
        page={page}
        ageFilter={filter as AgeFilter}
        pageSize={PAGE_SIZE}
        animalLabel="貓"
      />
    </main>
  );
}
```

- [ ] **Step 2: Create cat detail route**

Create `src/routes/animals/cat_.$id.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { AnimalDetail } from "../../components/site/AnimalDetail";

export const Route = createFileRoute("/animals/cat_/$id")({
  component: CatDetailPage,
});

function CatDetailPage() {
  const { id } = Route.useParams();

  const { data: animal, isLoading } = useQuery({
    queryKey: ["animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">
        載入中…
      </div>
    );

  if (!animal || animal.status !== "available") {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-xl text-[var(--color-text-muted)]">此動物已被領養 🎉</p>
        <Link to="/animals/cat" className="text-[var(--color-primary)] hover:underline">
          ← 返回貓貓列表
        </Link>
      </main>
    );
  }

  return <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/animals/cat.tsx src/routes/animals/cat_.$id.tsx
git commit -m "feat: add /animals/cat listing and detail routes"
```

---

### Task 12: Dog listing + detail routes

**Files:**

- Create: `src/routes/animals/dog.tsx`
- Create: `src/routes/animals/dog_.$id.tsx`

- [ ] **Step 1: Create dog listing route**

Create `src/routes/animals/dog.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AnimalGrid } from "../../components/site/AnimalGrid";
import type { AgeFilter } from "../../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/animals/dog")({
  validateSearch: searchSchema,
  component: DogListingPage,
});

function DogListingPage() {
  const { page, filter } = Route.useSearch();

  const { data, isLoading } = useQuery({
    queryKey: ["animals", "dog", page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("animals")
        .select("*", { count: "exact" })
        .eq("type", "dog")
        .eq("status", "available")
        .range(from, to);
      if (error) throw error;
      return { animals: data ?? [], total: count ?? 0 };
    },
  });

  if (isLoading)
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">
        載入中…
      </div>
    );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">待領養狗狗</h1>
      <AnimalGrid
        animals={data?.animals ?? []}
        total={data?.total ?? 0}
        page={page}
        ageFilter={filter as AgeFilter}
        pageSize={PAGE_SIZE}
        animalLabel="狗"
      />
    </main>
  );
}
```

- [ ] **Step 2: Create dog detail route**

Create `src/routes/animals/dog_.$id.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { AnimalDetail } from "../../components/site/AnimalDetail";

export const Route = createFileRoute("/animals/dog_/$id")({
  component: DogDetailPage,
});

function DogDetailPage() {
  const { id } = Route.useParams();

  const { data: animal, isLoading } = useQuery({
    queryKey: ["animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">
        載入中…
      </div>
    );

  if (!animal || animal.status !== "available") {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-xl text-[var(--color-text-muted)]">此動物已被領養 🎉</p>
        <Link to="/animals/dog" className="text-[var(--color-primary)] hover:underline">
          ← 返回狗狗列表
        </Link>
      </main>
    );
  }

  return <AnimalDetail animal={animal} backHref="/animals/dog" backLabel="返回狗狗列表" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/animals/dog.tsx src/routes/animals/dog_.$id.tsx
git commit -m "feat: add /animals/dog listing and detail routes"
```

---

### Task 13: Sponsors listing + detail routes

**Files:**

- Create: `src/routes/sponsors.tsx`
- Create: `src/routes/sponsors_.$id.tsx`

- [ ] **Step 1: Create sponsors listing**

Create `src/routes/sponsors.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { AnimalGrid } from "../components/site/AnimalGrid";
import type { AgeFilter } from "../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/sponsors")({
  validateSearch: searchSchema,
  component: SponsorsPage,
});

const paymentMethods = [
  { label: "FPS 轉數快", value: "12345678" },
  { label: "銀行轉帳", value: "012-345-678901 (Bank Name)" },
  { label: "PayMe", value: "@hkscda" },
  { label: "PayPal", value: "paypal@hkscda.com" },
  { label: "Give.asia", value: "give.asia/hkscda" },
  { label: "Alipay", value: "香港支付寶請掃碼" },
];

function SponsorsPage() {
  const { page, filter } = Route.useSearch();

  const { data, isLoading } = useQuery({
    queryKey: ["animals", "sponsor", page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("animals")
        .select("*", { count: "exact" })
        .eq("type", "sponsor")
        .eq("status", "available")
        .range(from, to);
      if (error) throw error;
      return { animals: data ?? [], total: count ?? 0 };
    },
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display text-3xl font-bold">助養區</h1>

      {/* Payment info */}
      <div className="bg-[var(--color-surface-offset)] rounded-2xl p-6">
        <h2 className="font-semibold mb-4">助養付款方式</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map((m) => (
            <div key={m.label} className="bg-[var(--color-surface)] rounded-lg p-3 space-y-1">
              <div className="text-xs font-semibold text-[var(--color-text-muted)]">{m.label}</div>
              <div className="text-sm">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">載入中…</div>
      ) : (
        <AnimalGrid
          animals={data?.animals ?? []}
          total={data?.total ?? 0}
          page={page}
          ageFilter={filter as AgeFilter}
          pageSize={PAGE_SIZE}
          animalLabel="助養動物"
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create sponsor detail route**

Create `src/routes/sponsors_.$id.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { AnimalDetail } from "../components/site/AnimalDetail";

export const Route = createFileRoute("/sponsors_/$id")({
  component: SponsorDetailPage,
});

function SponsorDetailPage() {
  const { id } = Route.useParams();

  const { data: animal, isLoading } = useQuery({
    queryKey: ["animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">
        載入中…
      </div>
    );

  if (!animal || animal.status !== "available") {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-xl text-[var(--color-text-muted)]">此動物已完成助養</p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← 返回助養區
        </Link>
      </main>
    );
  }

  return <AnimalDetail animal={animal} backHref="/sponsors" backLabel="返回助養區" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/sponsors.tsx src/routes/sponsors_.$id.tsx
git commit -m "feat: add /sponsors listing and detail routes"
```

---

## Phase 4: Adoption Application Form

### Task 14: submitApplication server function

**Files:**

- Create: `src/lib/api/submit-application.functions.ts`

- [ ] **Step 1: Create server function**

Create `src/lib/api/submit-application.functions.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const applicationSchema = z.object({
  animal_id: z.string().uuid().optional(),
  animal_name: z.string().min(1),
  animal_type: z.string().min(1),
  applicant_name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email(),
  address: z.string().min(5),
  housing_type: z.enum(["私人樓宇", "居屋", "公屋", "村屋", "其他"]),
  family_size: z.number().int().positive().optional(),
  existing_pets: z.string().optional(),
  reason: z.string().min(10),
});

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator(applicationSchema)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { Resend } = await import("resend");

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
    );

    const { error: dbError } = await supabase.from("adoption_applications").insert({
      animal_id: data.animal_id ?? null,
      animal_name: data.animal_name,
      animal_type: data.animal_type,
      applicant_name: data.applicant_name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      housing_type: data.housing_type,
      family_size: data.family_size ?? null,
      existing_pets: data.existing_pets ?? null,
      reason: data.reason,
    });

    if (dbError) throw new Error("Failed to save application");

    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: "HKSCDA <noreply@hkscda.com>",
      to: process.env.NOTIFICATION_EMAIL ?? "adoption@hkscda.com",
      subject: `新領養申請：${data.animal_name}（${data.applicant_name}）`,
      html: `
        <h2>新領養申請</h2>
        <p><strong>動物：</strong>${data.animal_name}（${data.animal_type}）</p>
        <p><strong>申請人：</strong>${data.applicant_name}</p>
        <p><strong>電話：</strong>${data.phone}</p>
        <p><strong>電郵：</strong>${data.email}</p>
        <p><strong>住址：</strong>${data.address}</p>
        <p><strong>住宅類型：</strong>${data.housing_type}</p>
        <p><strong>家庭人數：</strong>${data.family_size ?? "未填寫"}</p>
        <p><strong>現有寵物：</strong>${data.existing_pets || "沒有"}</p>
        <p><strong>領養原因：</strong>${data.reason}</p>
      `,
    });

    return { success: true };
  });
```

---

### Task 15: /adoption/apply page

**Files:**

- Create: `src/routes/adoption/apply.tsx`

- [ ] **Step 1: Create adoption apply route**

Create `src/routes/adoption/apply.tsx`:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { submitApplication } from "../../lib/api/submit-application.functions";

const formSchema = z.object({
  applicant_name: z.string().min(1, "請填寫姓名"),
  phone: z.string().min(8, "請填寫有效電話號碼"),
  email: z.string().email("請填寫有效電郵"),
  address: z.string().min(5, "請填寫完整住址"),
  housing_type: z.enum(["私人樓宇", "居屋", "公屋", "村屋", "其他"]),
  family_size: z.number().int().positive().optional(),
  existing_pets: z.string().optional(),
  reason: z.string().min(10, "請填寫至少10個字的領養原因"),
  agree_terms: z.literal(true, { errorMap: () => ({ message: "請同意條款" }) }),
});

type FormValues = z.infer<typeof formSchema>;

const searchSchema = z.object({
  animalId: z.string().optional(),
  animalName: z.string().optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/adoption/apply")({
  validateSearch: searchSchema,
  component: ApplyPage,
});

function ApplyPage() {
  const { animalId, animalName, type } = Route.useSearch();
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await submitApplication({
        data: {
          animal_id: animalId,
          animal_name: animalName ?? "未指定",
          animal_type: type ?? "unknown",
          applicant_name: values.applicant_name,
          phone: values.phone,
          email: values.email,
          address: values.address,
          housing_type: values.housing_type,
          family_size: values.family_size,
          existing_pets: values.existing_pets,
          reason: values.reason,
        },
      });
      setSuccess(true);
    } catch {
      setServerError("提交失敗，請稍後再試");
    }
  }

  if (success) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <div className="text-6xl">🎉</div>
        <h1 className="font-display text-2xl font-bold">申請已提交！</h1>
        <p className="text-[var(--color-text-muted)]">
          感謝您的申請，我們將盡快與您聯絡安排面見及家訪。
        </p>
        <Link
          to={type === "sponsor" ? "/sponsors" : type === "dog" ? "/animals/dog" : "/animals/cat"}
          className="inline-block px-6 py-3 bg-[var(--color-primary)] text-white rounded-full hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          返回列表
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">
        {type === "sponsor" ? "助養申請" : "領養申請"}
      </h1>
      {animalName && <p className="text-[var(--color-text-muted)] mb-6">申請動物：{animalName}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">申請人姓名 *</label>
          <input
            {...register("applicant_name")}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
          {errors.applicant_name && (
            <p className="text-red-500 text-xs mt-1">{errors.applicant_name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">聯絡電話 *</label>
          <input
            {...register("phone")}
            type="tel"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">電郵地址 *</label>
          <input
            {...register("email")}
            type="email"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">住址 *</label>
          <input
            {...register("address")}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
          {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">住宅類型 *</label>
          <select
            {...register("housing_type")}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">請選擇</option>
            {["私人樓宇", "居屋", "公屋", "村屋", "其他"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {errors.housing_type && (
            <p className="text-red-500 text-xs mt-1">{errors.housing_type.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">家庭成員人數</label>
          <input
            {...register("family_size", { valueAsNumber: true })}
            type="number"
            min={1}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">家中現有寵物</label>
          <input
            {...register("existing_pets")}
            placeholder="如沒有請留空"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">領養原因 *</label>
          <textarea
            {...register("reason")}
            rows={4}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
          {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
        </div>

        <div className="flex items-start gap-2">
          <input {...register("agree_terms")} type="checkbox" id="agree_terms" className="mt-1" />
          <label htmlFor="agree_terms" className="text-sm text-[var(--color-text-muted)]">
            我已閱讀並同意{" "}
            <Link
              to="/adoption/instructions"
              className="text-[var(--color-primary)] hover:underline"
              target="_blank"
            >
              領養條款
            </Link>
          </label>
        </div>
        {errors.agree_terms && <p className="text-red-500 text-xs">{errors.agree_terms.message}</p>}

        {serverError && <p className="text-red-500 text-sm">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-[var(--color-primary)] text-white rounded-full font-semibold hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "提交中…" : "提交申請"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Test form submission locally**

```bash
bun run dev
```

Navigate to `/adoption/apply?animalName=TIGER&type=cat`. Fill and submit form. Check Supabase dashboard for new row in `adoption_applications`. Check email inbox for notification.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/submit-application.functions.ts src/routes/adoption/apply.tsx
git commit -m "feat: add adoption application form with Supabase + Resend notification"
```

---

## Phase 5: Admin Panel

### Task 16: AdminLayout component + auth guard pattern

**Files:**

- Create: `src/components/admin/AdminLayout.tsx`

- [ ] **Step 1: Create AdminLayout**

Create `src/components/admin/AdminLayout.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";

type AdminSection = "cat" | "dog" | "sponsor" | "applications";

interface AdminLayoutProps {
  children: React.ReactNode;
  activeSection: AdminSection;
}

export function AdminLayout({ children, activeSection }: AdminLayoutProps) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  const navItems: { section: AdminSection; label: string; href: string }[] = [
    { section: "cat", label: "🐱 貓貓", href: "/admin?section=cat" },
    { section: "dog", label: "🐶 狗狗", href: "/admin?section=dog" },
    { section: "sponsor", label: "💛 助養", href: "/admin?section=sponsor" },
    { section: "applications", label: "📋 申請", href: "/admin?section=applications" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 bg-slate-900 text-slate-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            HKSCDA Admin
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.section}
              to={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === item.section
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 text-left"
          >
            登出
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  );
}
```

---

### Task 17: Admin login page

**Files:**

- Create: `src/routes/admin/login.tsx`

- [ ] **Step 1: Create login route**

Create `src/routes/admin/login.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError("電郵或密碼錯誤");
      return;
    }
    navigate({ to: "/admin" });
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 space-y-6">
        <div>
          <div className="text-2xl font-bold">HKSCDA</div>
          <div className="text-sm text-gray-500 mt-1">管理後台登入</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">電郵</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

---

### Task 18: AnimalsTable component

**Files:**

- Create: `src/components/admin/AnimalsTable.tsx`

- [ ] **Step 1: Create AnimalsTable**

Create `src/components/admin/AnimalsTable.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";

interface AnimalsTableProps {
  animals: Animal[];
  onDeleted: () => void;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  available: { label: "可領養", className: "bg-green-100 text-green-700" },
  adopted: { label: "已領養", className: "bg-orange-100 text-orange-700" },
  fostered: { label: "暫托中", className: "bg-blue-100 text-blue-700" },
};

export function AnimalsTable({ animals, onDeleted }: AnimalsTableProps) {
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = animals.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.name_en ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDelete(id: string) {
    await supabase.from("animals").delete().eq("id", id);
    setConfirmDelete(null);
    onDeleted();
  }

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋名字…"
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
              <th className="text-left p-3">照片</th>
              <th className="text-left p-3">名字</th>
              <th className="text-left p-3">性別</th>
              <th className="text-left p-3">年齡</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((animal) => {
              const status = statusLabels[animal.status];
              return (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    {animal.image_url ? (
                      <img
                        src={animal.image_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-lg">
                        {animal.type === "dog" ? "🐶" : "🐱"}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    {animal.name}
                    {animal.name_en && (
                      <span className="text-gray-400 ml-1 font-normal">{animal.name_en}</span>
                    )}
                  </td>
                  <td className="p-3">{animal.gender === "male" ? "公" : "母"}</td>
                  <td className="p-3">{animal.age}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3">
                      <Link
                        to={`/admin/animals/${animal.id}/edit`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        編輯
                      </Link>
                      {confirmDelete === animal.id ? (
                        <span className="flex gap-2 text-xs">
                          <button
                            onClick={() => handleDelete(animal.id)}
                            className="text-red-600 hover:underline"
                          >
                            確認
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-gray-500 hover:underline"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(animal.id)}
                          className="text-red-500 hover:underline text-xs"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  沒有結果
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Task 19: AnimalForm component

**Files:**

- Create: `src/components/admin/AnimalForm.tsx`

- [ ] **Step 1: Create AnimalForm**

Create `src/components/admin/AnimalForm.tsx`:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";

const animalSchema = z.object({
  name: z.string().min(1, "請填寫名字"),
  name_en: z.string().optional(),
  type: z.enum(["cat", "dog", "sponsor"]),
  gender: z.enum(["male", "female"]),
  age: z.string().min(1, "請填寫年齡"),
  notes: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["available", "adopted", "fostered"]),
});

type FormValues = z.infer<typeof animalSchema>;

interface AnimalFormProps {
  existing?: Animal;
}

export function AnimalForm({ existing }: AnimalFormProps) {
  const navigate = useNavigate();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(animalSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          name_en: existing.name_en ?? "",
          type: existing.type,
          gender: existing.gender,
          age: existing.age,
          notes: existing.notes ?? "",
          description: existing.description ?? "",
          status: existing.status,
        }
      : { type: "cat", gender: "female", status: "available" },
  });

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    let image_url = existing?.image_url ?? null;

    if (imageFile) {
      const animalId = existing?.id ?? crypto.randomUUID();
      const { error: uploadError } = await supabase.storage
        .from("animal-images")
        .upload(`${animalId}.jpg`, imageFile, { upsert: true });
      if (uploadError) {
        setError("圖片上載失敗");
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("animal-images")
        .getPublicUrl(`${animalId}.jpg`);
      image_url = urlData.publicUrl;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("animals")
        .update({ ...values, image_url, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) {
        setError("儲存失敗");
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("animals")
        .insert({ ...values, image_url });
      if (insertError) {
        setError("儲存失敗");
        setSaving(false);
        return;
      }
    }

    navigate({ to: "/admin" });
  }

  const field =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">名字 *</label>
          <input {...register("name")} className={field} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">英文名</label>
          <input {...register("name_en")} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">類別 *</label>
          <select {...register("type")} className={field}>
            <option value="cat">貓</option>
            <option value="dog">狗</option>
            <option value="sponsor">助養</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">性別 *</label>
          <select {...register("gender")} className={field}>
            <option value="female">母</option>
            <option value="male">公</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">狀態 *</label>
          <select {...register("status")} className={field}>
            <option value="available">可領養</option>
            <option value="adopted">已領養</option>
            <option value="fostered">暫托中</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">年齡 *</label>
          <input {...register("age")} placeholder="如：6歲 / 4個月" className={field} />
          {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">備注標籤</label>
          <input {...register("notes")} placeholder="如：親人、BB一對" className={field} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">描述</label>
        <textarea {...register("description")} rows={4} className={field} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">照片</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {existing?.image_url && !imageFile && (
          <img src={existing.image_url} alt="" className="w-20 h-20 object-cover rounded mt-2" />
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin" })}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          取消
        </button>
      </div>
    </form>
  );
}
```

---

### Task 20: Admin dashboard + CRUD routes

**Files:**

- Create: `src/routes/admin/index.tsx`
- Create: `src/routes/admin/animals/new.tsx`
- Create: `src/routes/admin/animals/$id.edit.tsx`

- [ ] **Step 1: Create admin dashboard**

Create `src/routes/admin/index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";
import type { AnimalType } from "../../types/animal";

const searchSchema = z.object({
  section: z.enum(["cat", "dog", "sponsor", "applications"]).catch("cat"),
});

export const Route = createFileRoute("/admin/")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminDashboard,
});

const sectionLabels: Record<string, string> = {
  cat: "貓貓",
  dog: "狗狗",
  sponsor: "助養動物",
  applications: "領養申請",
};

function AdminDashboard() {
  const { section } = Route.useSearch();
  const queryClient = useQueryClient();

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["admin-animals", section],
    queryFn: async () => {
      if (section === "applications") return [];
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("type", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: section !== "applications",
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adoption_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: section === "applications",
  });

  return (
    <AdminLayout activeSection={section as "cat" | "dog" | "sponsor" | "applications"}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{sectionLabels[section]}</h1>
          {section !== "applications" && (
            <Link
              to="/admin/animals/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + 新增
            </Link>
          )}
        </div>

        {section === "applications" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                  <th className="text-left p-3">申請人</th>
                  <th className="text-left p-3">動物</th>
                  <th className="text-left p-3">電話</th>
                  <th className="text-left p-3">日期</th>
                  <th className="text-left p-3">狀態</th>
                  <th className="text-left p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(
                  (app: {
                    id: string;
                    applicant_name: string;
                    animal_name: string;
                    phone: string;
                    created_at: string;
                    status: string;
                  }) => (
                    <tr key={app.id} className="border-b border-gray-100">
                      <td className="p-3">{app.applicant_name}</td>
                      <td className="p-3">{app.animal_name}</td>
                      <td className="p-3">{app.phone}</td>
                      <td className="p-3">
                        {new Date(app.created_at).toLocaleDateString("zh-HK")}
                      </td>
                      <td className="p-3">
                        <select
                          defaultValue={app.status}
                          onChange={async (e) => {
                            await supabase
                              .from("adoption_applications")
                              .update({ status: e.target.value })
                              .eq("id", app.id);
                            queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
                          }}
                          className="border border-gray-300 rounded text-xs px-2 py-1"
                        >
                          <option value="pending">待處理</option>
                          <option value="approved">已批准</option>
                          <option value="rejected">已拒絕</option>
                        </select>
                      </td>
                      <td className="p-3 text-gray-400 text-xs">{app.id.slice(0, 8)}…</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : (
          <AnimalsTable
            animals={animals}
            onDeleted={() =>
              queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })
            }
          />
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Create add animal route**

Create `src/routes/admin/animals/new.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";

export const Route = createFileRoute("/admin/animals/new")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: NewAnimalPage,
});

function NewAnimalPage() {
  return (
    <AdminLayout activeSection="cat">
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">新增動物</h1>
        <AnimalForm />
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Create edit animal route**

Create `src/routes/admin/animals/$id.edit.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";

export const Route = createFileRoute("/admin/animals/$id/edit")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: EditAnimalPage,
});

function EditAnimalPage() {
  const { id } = Route.useParams();

  const { data: animal, isLoading } = useQuery({
    queryKey: ["admin-animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-6 text-gray-400">載入中…</div>;
  if (!animal) return <div className="p-6 text-gray-400">找不到此動物</div>;

  return (
    <AdminLayout activeSection={animal.type as "cat" | "dog" | "sponsor" | "applications"}>
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">編輯：{animal.name}</h1>
        <AnimalForm existing={animal} />
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 4: Test full admin flow**

```bash
bun run dev
```

1. Visit `http://localhost:3000/admin/login` — verify redirect if not logged in
2. Log in with a Supabase admin account
3. Add a test cat entry with a photo — verify it appears in the table
4. Edit the entry — verify changes save
5. Delete the entry — verify it's removed
6. Check `/animals/cat` — deleted item should not appear

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ src/routes/admin/
git commit -m "feat: add admin panel (login, dashboard, add/edit/delete animals, applications view)"
```

---

## Phase 6: Final Integration + Deploy

### Task 21: Add Vercel environment variables + deploy

- [ ] **Step 1: Add env vars to Vercel**

In Vercel dashboard for project `hkscda`:

- Settings → Environment Variables
- Add: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`
- Scope: Production + Preview

- [ ] **Step 2: Final build check**

```bash
bun run build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 3: Push to trigger deploy**

```bash
git push
```

Vercel auto-deploys from `main`. Check deployment URL.

- [ ] **Step 4: Smoke test production**

Visit deployed URL. Test:

- [ ] Header dropdowns work
- [ ] `/about` renders
- [ ] `/animals/cat` loads from Supabase (empty state is fine)
- [ ] `/admin/login` redirects correctly
- [ ] Adoption form submits (check email)

---

## Self-Review

**Spec coverage check:**

| Spec section                          | Task            |
| ------------------------------------- | --------------- |
| Routes — static pages                 | Tasks 5–7       |
| Routes — cat/dog listing + detail     | Tasks 11–12     |
| Routes — sponsors listing + detail    | Task 13         |
| Routes — admin panel                  | Tasks 17, 20    |
| Routes — adoption form                | Task 15         |
| Database schema                       | Task 2          |
| Supabase client + types               | Task 3          |
| Navigation header                     | Task 4          |
| AnimalCard, AnimalGrid, AnimalDetail  | Tasks 8–10      |
| AdminLayout, AnimalsTable, AnimalForm | Tasks 16, 18–19 |
| submitApplication server fn + Resend  | Task 14         |
| Dependencies install                  | Task 1          |
| Deploy                                | Task 21         |

All spec sections are covered. No TBD or placeholder steps.
