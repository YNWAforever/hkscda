# HKSCDA Content Migration & Dynamic Animal System

**Date:** 2026-06-11  
**Scope:** Migrate 9 pages from hkscda.com into the new TanStack Start site, add Supabase-backed animal listings with pagination, individual animal detail pages, and a password-protected admin panel.

---

## 1. Routes

### Static content pages (hardcoded text, no database)

| Route                    | File                                   | Source content                                                     |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| `/about`                 | `src/routes/about/index.tsx`           | 協會簡介 — mission, programs, fees table, media history            |
| `/about/cccp`            | `src/routes/about/cccp.tsx`            | CCCP plan explanation, comparison table, monthly operation details |
| `/about/tnr`             | `src/routes/about/tnr.tsx`             | TNR explanation, three phases (Trap / Neuter / Return)             |
| `/about/team`            | `src/routes/about/team.tsx`            | Board: 主席 謝曉梅, 名譽主席 鄧殷                                  |
| `/about/privacy`         | `src/routes/about/privacy.tsx`         | Full privacy policy (PDPO compliance)                              |
| `/adoption/instructions` | `src/routes/adoption/instructions.tsx` | 12 adoption rules + cat care + dog care sections                   |

### Dynamic animal pages (Supabase-backed)

| Route              | File                              | Notes                                                          |
| ------------------ | --------------------------------- | -------------------------------------------------------------- |
| `/animals/cat`     | `src/routes/animals/cat.tsx`      | Cat listing — photo grid, age filter, 16/page                  |
| `/animals/dog`     | `src/routes/animals/dog.tsx`      | Dog listing — same layout                                      |
| `/animals/cat/$id` | `src/routes/animals/cat_.$id.tsx` | Cat detail page                                                |
| `/animals/dog/$id` | `src/routes/animals/dog_.$id.tsx` | Dog detail page                                                |
| `/sponsors`        | `src/routes/sponsors.tsx`         | Sponsor listing — same grid layout, payment info header        |
| `/sponsors/$id`    | `src/routes/sponsors_.$id.tsx`    | Sponsor animal detail page (same two-column layout as cat/dog) |

### Admin pages (auth-protected)

| Route                     | File                                    | Notes                                                                       |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `/admin/login`            | `src/routes/admin/login.tsx`            | Email/password login form                                                   |
| `/admin`                  | `src/routes/admin/index.tsx`            | Dashboard: sidebar nav (貓/狗/助養) + data table                            |
| `/admin/animals/new`      | `src/routes/admin/animals/new.tsx`      | Add animal form                                                             |
| `/admin/animals/$id/edit` | `src/routes/admin/animals/$id.edit.tsx` | Edit animal form                                                            |
| `/adoption/apply`         | `src/routes/adoption/apply.tsx`         | Adoption application form (pre-filled with animal name/id via query params) |

---

## 2. Database Schema (Supabase)

### `animals` table

```sql
create table animals (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null check (type in ('cat', 'dog', 'sponsor')),
  name        text        not null,
  name_en     text,
  gender      text        not null check (gender in ('male', 'female')),
  age         text        not null,           -- stored as display string e.g. "6歲", "4個月"
  description text,                           -- shown on detail page
  notes       text,                           -- short tag shown on listing card e.g. "親人", "BB一對"
  status      text        not null default 'available'
                          check (status in ('available', 'adopted', 'fostered')),
  image_url   text,                           -- Supabase Storage public URL
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- RLS: public can read available animals; only authenticated users can write
alter table animals enable row level security;

create policy "public read available"
  on animals for select
  using (status = 'available');

create policy "admin full access"
  on animals for all
  using (auth.role() = 'authenticated');
```

### Supabase Storage

- Bucket: `animal-images` — public read, authenticated write
- Files named `{uuid}.jpg` matching the animal record ID
- Admin panel uploads via `supabase.storage.from('animal-images').upload()`

### Auth

- Supabase Auth, email/password provider
- Single admin account (or small team — managed in Supabase dashboard)
- No sign-up flow — admin accounts created manually in Supabase dashboard

---

## 3. Navigation (Header)

Replace all anchor `href="#..."` links with TanStack Router `<Link>` components. Add two dropdown menus:

```
🐾 HKSCDA
  主頁            → /
  關於協會 ▾
    協會簡介       → /about
    CCCP計劃      → /about/cccp
    TNR計劃       → /about/tnr
    團隊           → /about/team
    私隱聲明       → /about/privacy
  領養 ▾
    領養需知       → /adoption/instructions
    待領養貓貓     → /animals/cat
    待領養狗狗     → /animals/dog
  助養區           → /sponsors
  [💛 立即捐助]   → scrolls to #donate on homepage (keep as anchor)
```

Dropdowns: open on hover (desktop), toggle on tap (mobile). Implement with Radix UI `NavigationMenu` (already installed).

Mobile: existing hamburger menu expands to show all links in a flat list with section labels.

---

## 4. Animal Listing Pages (`/animals/cat`, `/animals/dog`, `/sponsors`)

### Layout

- Page header: title + animal count badge
- Filter tabs: 全部 / BB (under 1yr) / 成貓 or 成犬 (1–7yr) / 老貓 or 老狗 (7yr+)
  - Filter applied as URL search param `?filter=bb|adult|senior`
  - Age parsing: check if `age` string contains "個月" (months) → BB; else parse year number
- Grid: 4 columns desktop, 2 columns mobile, 16 animals per page
- Pagination: `page` URL search param, `← 1 2 3 … →` controls
- Data: `useQuery` with Supabase `.from('animals').select().eq('type','cat').eq('status','available').range(from, to)`

### Animal card

```
┌─────────────────────┐
│  [photo]            │  ← aspect-ratio: 1, object-cover
├─────────────────────┤
│  Name               │
│  [age] [gender] [note]│  ← pill tags
│  [申請領養 →]       │  ← links to detail page
└─────────────────────┘
```

If `image_url` is null, show a breed-appropriate placeholder (🐱 or 🐶 emoji on coloured background). No ID badge — UUIDs are not human-readable display values.

### Sponsors page

Same grid layout but with a payment info section above the grid showing all donation methods (FPS, bank transfer, PayMe, PayPal, Give.asia, Alipay). Query is filtered to `type='sponsor'` only. Age filter tabs apply (BB / 成 / 老). Each card links to `/sponsors/$id`. The card CTA reads "立即助養" instead of "申請領養".

---

## 5. Animal Detail Pages (`/animals/cat/$id`, `/animals/dog/$id`)

### Layout (two-column hero)

```
┌──────────────────────────────────────────────┐
│ ← Back to listing                            │
├─────────────────┬────────────────────────────┤
│                 │  Name (large)              │
│   Photo         │  [gender] [age] [notes]    │
│   (square,      │                            │
│    left col)    │  Description               │
│                 │  (paragraph from DB)       │
│                 │                            │
│                 │  [📩 申請領養]  (primary)  │
│                 │  [← 返回列表]  (outline)   │
└─────────────────┴────────────────────────────┘
```

- On mobile: stacks vertically (photo top, info below)
- "申請領養" button: navigates to `/adoption/apply?animalId=[id]&animalName=[name]&type=[cat|dog|sponsor]`
- Data: `useQuery` keyed on `id`, `supabase.from('animals').select().eq('id', id).single()`
- If animal not found or status !== 'available': show "此動物已被領養" message with link back to listing

### Sponsor detail page (`/sponsors/$id`)

Same two-column layout as cat/dog detail (photo left, info right). CTA button reads "立即助養" and navigates to `/adoption/apply?animalId=[id]&animalName=[name]&type=sponsor`. "返回" link goes to `/sponsors`.

---

## 5b. Adoption Application Form (`/adoption/apply`)

### Purpose

Linked to from every "申請領養" / "立即助養" button. Pre-fills animal info from URL query params (`animalId`, `animalName`, `type`).

### Form fields

- 動物名字 (pre-filled, read-only if passed via query param)
- 申請人姓名 (required)
- 聯絡電話 (required)
- 電郵地址 (required)
- 住址 (required — home visit needed)
- 住宅類型 (select: 私人樓宇 / 居屋 / 公屋 / 村屋 / 其他)
- 家庭成員人數 (number)
- 家中現有寵物 (text, optional)
- 領養原因 (textarea, required)
- 同意條款 (checkbox linking to `/adoption/instructions`, required)

### Submission

1. Validate with zod
2. Insert into `adoption_applications` Supabase table
3. Trigger email to `adoption@hkscda.com` via **Resend** (server function in TanStack Start)
4. Show success page with "我們將盡快與您聯絡" message and link back to listing

### `adoption_applications` table

```sql
create table adoption_applications (
  id            uuid        primary key default gen_random_uuid(),
  animal_id     uuid        references animals(id),
  animal_name   text        not null,
  animal_type   text        not null,
  applicant_name text       not null,
  phone         text        not null,
  email         text        not null,
  address       text        not null,
  housing_type  text        not null,
  family_size   integer,
  existing_pets text,
  reason        text        not null,
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz default now()
);

-- Only authenticated admins can read applications
alter table adoption_applications enable row level security;

create policy "admin only"
  on adoption_applications for all
  using (auth.role() = 'authenticated');
```

### Admin: Applications view

Add a fourth sidebar item "📋 申請" to the admin panel. Shows a table of pending applications with applicant name, animal, date, status. Admin can update status (pending → approved / rejected). No email sent on status change in v1.

---

## 6. Admin Panel (`/admin`)

### Auth guard

All `/admin/*` routes check `supabase.auth.getSession()` in `beforeLoad`. If no session, redirect to `/admin/login`.

### Login page (`/admin/login`)

- Email + password form
- Calls `supabase.auth.signInWithPassword()`
- On success: redirect to `/admin`
- Error: show inline error message

### Dashboard (`/admin`)

**Sidebar (dark, fixed):** HKSCDA logo, nav items: 🐱 貓貓 / 🐶 狗狗 / 💛 助養 / 📋 申請 / 登出 button at bottom.

**Main area:**

- Active section heading + animal count
- "+ 新增" button → `/admin/animals/new`
- Search input (client-side filter on name)
- Data table columns: 照片 (thumbnail) | 名字 | 性別 | 年齡 | 狀態 | 操作 (編輯 / 刪除)
- Status badge: 可領養 (green) / 已領養 (orange) / 暫托中 (blue)
- Delete: confirm dialog before calling `supabase.from('animals').delete()`

### Add / Edit form (`/admin/animals/new`, `/admin/animals/$id/edit`)

Fields:

- 名字 (required text)
- 英文名 (optional text)
- 類別 (select: 貓 / 狗 / 助養)
- 性別 (radio: 公 / 母)
- 年齡 (text, e.g. "6歲" or "4個月")
- 備注 (text, short tag shown on card)
- 描述 (textarea, shown on detail page)
- 狀態 (select: 可領養 / 已領養 / 暫托中)
- 照片 (file input → upload to Supabase Storage on submit)

Form uses `react-hook-form` + `zod` (both already installed).

---

## 7. Supabase Client Setup

Add `@supabase/supabase-js` as a dependency. Create `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

Add to `.env.local` (not committed):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Add to Vercel environment variables for production.

---

## 8. Static Content — Key Text to Preserve

All text is in Traditional Chinese. Each static page is a plain React component rendering the scraped content structured into sections using existing CSS variables and UI patterns.

| Page                     | Key sections                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `/about`                 | 協會簡介, 協會宗旨 (7 items), 主要工作, 貓舍狗舍, 收費表                                                                         |
| `/about/cccp`            | What is CCCP, Why CCCP, before/after comparison table, monthly operation, support section                                        |
| `/about/tnr`             | Definition, success criteria (70%), 3 phases (Trap/Neuter/Return), current situation without TNR                                 |
| `/about/team`            | 董事會: 主席 謝曉梅女士, 名譽主席 鄧殷女士                                                                                       |
| `/about/privacy`         | 5 sections: collection, use, security, disclosure, retention, access rights                                                      |
| `/adoption/instructions` | 12 adoption rules, 養貓需知 (tabs: 家居/領取/糧食/清潔/保健/用品/安窗), 養狗需知 (tabs: 家居/領取/食物/休息/清潔/保健/溜狗/教育) |

---

## 9. Out of Scope

- Work reports (`/work-reports`) — not in the requested pages
- News & media — not in the requested pages
- Activities / events — not in the requested pages
- Online donation flow — existing `#donate` section on homepage handles this
- Multi-language support (English) — site is Traditional Chinese only
- Email status updates to applicants on approval/rejection — admin sees status in dashboard only (v1)

---

## 10. Dependencies to Add

- `@supabase/supabase-js` — Supabase client + auth + storage
- `resend` — transactional email (new application notifications to `adoption@hkscda.com`)

Everything else (TanStack Query, react-hook-form, zod, Radix UI NavigationMenu) is already installed.

### Environment variables to add

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
RESEND_API_KEY=           # server-side only, no VITE_ prefix
NOTIFICATION_EMAIL=adoption@hkscda.com
```
