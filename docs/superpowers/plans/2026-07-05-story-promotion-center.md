# Story And Promotion Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Story Wall, public-safe rescue map, promotion CMS, social-copy generator, and adopter-update draft workflow.

**Architecture:** Add a new `content` domain parallel to `volunteers`, `crm`, and `adoptions`. Keep public data mapping separate from admin mapping so internal rescue locations and notification drafts cannot leak. Use thin TanStack route files that call server handler factories, with pure domain helpers covered before UI work.

**Tech Stack:** TypeScript, TanStack Start, TanStack Router, React 19, Bun test, Supabase service-role repositories, Tailwind CSS v4 tokens, shadcn/Radix primitives already present in `src/components/ui/`.

---

## Scope Check

The approved design spans public UI, admin UI, database tables, APIs, social copy, and adopter notification drafts. This stays as one implementation plan because the central deliverable is one shared publishing domain. Each task below produces a working, testable slice and should be committed before moving to the next task.

## File Structure

- Create `supabase/migrations/20260705120000_story_promotion_center.sql` for content tables, constraints, indexes, grants, and RLS.
- Create `src/lib/content/migrationPolicy.test.ts` for a static migration guard.
- Modify `src/lib/admin/access.ts`, `src/lib/admin/access.test.ts`, `src/components/admin/adminNav.ts`, `src/components/admin/adminNav.test.ts`, and `src/components/admin/adminI18n.tsx` for `contentManagement`.
- Create `src/lib/content/types.ts` for public/admin content types.
- Create `src/lib/content/schemas.ts` for zod parsing and bounded filters.
- Create `src/lib/content/rules.ts` and `src/lib/content/rules.test.ts` for publish validation and public-safe mapping.
- Create `src/lib/content/socialCopy.ts` and `src/lib/content/socialCopy.test.ts` for Facebook, Instagram, and WhatsApp copy drafts.
- Create `src/lib/content/notificationDrafts.ts` and `src/lib/content/notificationDrafts.test.ts` for adopter draft recipient resolution and body creation.
- Create `src/lib/content/service.ts` and `src/lib/content/service.test.ts` for orchestration and audit actions.
- Create `src/lib/content/repository.server.ts` and `src/lib/content/repositoryMapping.test.ts` for Supabase row mapping and repository methods.
- Create `src/lib/content/http.server.ts` and `src/lib/content/http.test.ts` for public/admin handlers.
- Create route files at `src/routes/api/stories.ts`, under `src/routes/api/stories/`, and under `src/routes/api/admin/content/`.
- Create admin components under `src/components/admin/content/`.
- Create public components under `src/components/site/stories/`.
- Create public routes `src/routes/stories.tsx` and `src/routes/stories/$slug.tsx`.
- Modify `src/components/site/Header.tsx` to link the new public hub.

---

## Task 1: Database And Admin Access Foundation

**Files:**

- Create: `supabase/migrations/20260705120000_story_promotion_center.sql`
- Create: `src/lib/content/migrationPolicy.test.ts`
- Modify: `src/lib/admin/access.ts`
- Modify: `src/lib/admin/access.test.ts`
- Modify: `src/components/admin/adminNav.ts`
- Modify: `src/components/admin/adminNav.test.ts`
- Modify: `src/components/admin/adminI18n.tsx`

- [ ] **Step 1: Write the failing migration policy test**

Create `src/lib/content/migrationPolicy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260705120000_story_promotion_center.sql"),
  "utf8",
);

describe("story promotion center migration", () => {
  test("creates every publishing table with RLS enabled", () => {
    for (const table of [
      "content_item",
      "content_link",
      "rescue_story_profile",
      "story_update",
      "content_media",
      "social_copy_variant",
      "recipient_notification_draft",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test("keeps direct table access private and staff-gated", () => {
    expect(migration).toContain("revoke all on public.rescue_story_profile from anon, authenticated");
    expect(migration).toContain("revoke all on public.recipient_notification_draft from anon, authenticated");
    expect(migration).toContain("private.has_admin_role(array['staff', 'admin'])");
    expect(migration).not.toContain("grant select on public.rescue_story_profile to anon");
    expect(migration).not.toContain("grant select on public.recipient_notification_draft to anon");
  });

  test("stores separate public-safe and internal rescue locations", () => {
    expect(migration).toContain("public_map_label text");
    expect(migration).toContain("public_lat numeric(9, 6)");
    expect(migration).toContain("public_lng numeric(9, 6)");
    expect(migration).toContain("internal_address text");
    expect(migration).toContain("internal_location_notes text");
  });
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
bun test src/lib/content/migrationPolicy.test.ts
```

Expected: FAIL because `20260705120000_story_promotion_center.sql` does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260705120000_story_promotion_center.sql`:

```sql
create table if not exists public.content_item (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  type text not null check (type in ('rescue_story', 'event', 'charity_market', 'report')),
  title text not null,
  subtitle text,
  summary text not null,
  body text,
  cover_media_id uuid,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  cta_label text,
  cta_url text,
  seo_title text,
  seo_description text,
  og_title text,
  og_description text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create table if not exists public.content_link (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  linked_type text not null check (linked_type in ('animal', 'adoption_case', 'successful_adoption', 'supporter', 'volunteer_activity')),
  linked_id uuid not null,
  relationship text not null default 'other' check (relationship in ('primary_subject', 'related_case', 'adopter', 'volunteer_context', 'other')),
  created_at timestamptz not null default now(),
  unique (content_item_id, linked_type, linked_id, relationship)
);

create unique index if not exists content_link_one_primary_animal_idx
  on public.content_link (content_item_id)
  where linked_type = 'animal' and relationship = 'primary_subject';

create table if not exists public.rescue_story_profile (
  content_item_id uuid primary key references public.content_item(id) on delete cascade,
  animal_type text not null check (animal_type in ('cat', 'dog', 'mixed', 'unknown')),
  public_status text not null check (public_status in ('rescued', 'medical_care', 'foster_recovery', 'ready_for_adoption', 'adopted', 'sponsor_needed', 'closed')),
  rescue_region text not null,
  rescue_date date,
  show_on_map boolean not null default false,
  public_map_label text,
  public_lat numeric(9, 6),
  public_lng numeric(9, 6),
  internal_address text,
  internal_location_notes text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    show_on_map = false or
    (public_map_label is not null and public_lat is not null and public_lng is not null)
  )
);

create table if not exists public.story_update (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  kind text not null check (kind in ('medical', 'care', 'photo', 'foster', 'adoption', 'general')),
  title text not null,
  body text,
  occurred_at timestamptz not null,
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  should_generate_adopter_drafts boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  story_update_id uuid references public.story_update(id) on delete cascade,
  storage_bucket text not null default 'content-media',
  storage_path text not null,
  alt_text text not null,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

alter table public.content_item
  drop constraint if exists content_item_cover_media_fk;

alter table public.content_item
  add constraint content_item_cover_media_fk
  foreign key (cover_media_id) references public.content_media(id) on delete set null;

create table if not exists public.social_copy_variant (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  story_update_id uuid references public.story_update(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'whatsapp')),
  language text not null default 'zh-HK' check (language = 'zh-HK'),
  copy_text text not null,
  hashtags text[] not null default array[]::text[],
  status text not null default 'draft' check (status in ('draft', 'copied', 'archived')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipient_notification_draft (
  id uuid primary key default gen_random_uuid(),
  story_update_id uuid not null references public.story_update(id) on delete cascade,
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  adoption_case_id uuid references public.adoption_case(id) on delete set null,
  supporter_id uuid references public.supporter(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_name text not null,
  recipient_contact text not null,
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'copied', 'sent_manually', 'dismissed')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'content_item',
    'rescue_story_profile',
    'story_update',
    'social_copy_variant',
    'recipient_notification_draft'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

create index if not exists content_item_status_type_published_idx
  on public.content_item (status, type, published_at desc);

create index if not exists content_item_slug_status_idx
  on public.content_item (slug, status);

create index if not exists content_link_content_idx
  on public.content_link (content_item_id, linked_type, relationship);

create index if not exists rescue_story_profile_region_status_idx
  on public.rescue_story_profile (rescue_region, public_status);

create index if not exists story_update_content_public_idx
  on public.story_update (content_item_id, visibility, occurred_at desc);

create index if not exists content_media_content_sort_idx
  on public.content_media (content_item_id, sort_order, created_at);

create index if not exists social_copy_content_platform_idx
  on public.social_copy_variant (content_item_id, platform, created_at desc);

create index if not exists recipient_notification_draft_update_status_idx
  on public.recipient_notification_draft (story_update_id, status);

alter table public.content_item enable row level security;
alter table public.content_link enable row level security;
alter table public.rescue_story_profile enable row level security;
alter table public.story_update enable row level security;
alter table public.content_media enable row level security;
alter table public.social_copy_variant enable row level security;
alter table public.recipient_notification_draft enable row level security;

grant select, insert, update, delete on public.content_item to service_role;
grant select, insert, update, delete on public.content_link to service_role;
grant select, insert, update, delete on public.rescue_story_profile to service_role;
grant select, insert, update, delete on public.story_update to service_role;
grant select, insert, update, delete on public.content_media to service_role;
grant select, insert, update, delete on public.social_copy_variant to service_role;
grant select, insert, update, delete on public.recipient_notification_draft to service_role;

revoke all on public.content_item from anon, authenticated;
revoke all on public.content_link from anon, authenticated;
revoke all on public.rescue_story_profile from anon, authenticated;
revoke all on public.story_update from anon, authenticated;
revoke all on public.content_media from anon, authenticated;
revoke all on public.social_copy_variant from anon, authenticated;
revoke all on public.recipient_notification_draft from anon, authenticated;

drop policy if exists "staff can manage content items" on public.content_item;
create policy "staff can manage content items"
  on public.content_item for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage content links" on public.content_link;
create policy "staff can manage content links"
  on public.content_link for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage rescue story profiles" on public.rescue_story_profile;
create policy "staff can manage rescue story profiles"
  on public.rescue_story_profile for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage story updates" on public.story_update;
create policy "staff can manage story updates"
  on public.story_update for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage content media" on public.content_media;
create policy "staff can manage content media"
  on public.content_media for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage social copy variants" on public.social_copy_variant;
create policy "staff can manage social copy variants"
  on public.social_copy_variant for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can manage recipient notification drafts" on public.recipient_notification_draft;
create policy "staff can manage recipient notification drafts"
  on public.recipient_notification_draft for all
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));
```

- [ ] **Step 4: Run the migration test and verify it passes**

Run:

```bash
bun test src/lib/content/migrationPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing access and nav tests**

Update `src/lib/admin/access.test.ts`:

```ts
expect(canRoleAccessAdminArea("staff", "contentManagement")).toBe(true);
expect(canRoleAccessAdminArea("treasurer", "contentManagement")).toBe(false);
expect(canRoleAccessAdminArea("admin", "contentManagement")).toBe(true);
expect(getAdminAreaForLocation({ pathname: "/admin/content" })).toBe("contentManagement");
expect(getAdminAreaForLocation({ pathname: "/admin/content/99999999-aaaa-4333-8444-555555555555" })).toBe("contentManagement");
```

Add `"content"` to the `itemIds` array and update role expectations:

```ts
expect(filterAdminNavItemIdsByRole(itemIds, "staff")).toEqual([
  "cat",
  "dog",
  "sponsor",
  "applications",
  "coordinator-intake",
  "volunteers",
  "payments",
  "content",
]);
expect(filterAdminNavItemIdsByRole(itemIds, "treasurer")).toEqual(["payments", "supporters"]);
expect(filterAdminNavItemIdsByRole(itemIds, "admin")).toEqual(itemIds);
```

Update `src/components/admin/adminNav.test.ts`:

```ts
test("uses the content item on content routes", () => {
  expect(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/content", "content")).toEqual([
    "content",
  ]);
  expect(
    getActiveAdminNavItemIds(
      ADMIN_NAV_ITEMS,
      "/admin/content/99999999-aaaa-4333-8444-555555555555",
      "content",
    ),
  ).toEqual(["content"]);
});
```

- [ ] **Step 6: Run access and nav tests and verify they fail**

Run:

```bash
bun test src/lib/admin/access.test.ts src/components/admin/adminNav.test.ts
```

Expected: FAIL because `contentManagement` and `content` do not exist.

- [ ] **Step 7: Implement admin access and navigation**

Modify `src/lib/admin/access.ts`:

```ts
export type AdminDashboardSection =
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";

export type AdminAccessArea =
  | "animals"
  | "adoptionCases"
  | "manualIntake"
  | "coordinatorTasks"
  | "adopters"
  | "coordinatorReports"
  | "coordinatorStatuses"
  | "payments"
  | "supporters"
  | "volunteerManagement"
  | "contentManagement"
  | "accessManagement";
```

Add `"contentManagement"` to the `staff` and `admin` role sets. Add this nav mapping:

```ts
content: "contentManagement",
```

Add this route mapping before `/admin/access`:

```ts
if (input.pathname.startsWith("/admin/content")) return "contentManagement";
```

Modify `src/components/admin/adminNav.ts`:

```ts
import { Megaphone } from "lucide-react";

export type AdminSection =
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";

export type AdminNavGroup = "animals" | "adoptions" | "donations" | "promotion" | "system";

export const ADMIN_NAV_GROUPS: { id: AdminNavGroup; label: string }[] = [
  { id: "animals", label: "動物" },
  { id: "adoptions", label: "領養" },
  { id: "donations", label: "捐款" },
  { id: "promotion", label: "宣傳" },
  { id: "system", label: "系統" },
];
```

Add this nav item before `access-management`:

```ts
{
  id: "content",
  section: "content",
  group: "promotion",
  label: "宣傳內容",
  icon: Megaphone,
  to: "/admin/content",
  activePath: "/admin/content",
},
```

Modify `src/components/admin/adminI18n.tsx` so both languages include:

```ts
promotion: "宣傳",
content: "宣傳內容",
```

and:

```ts
promotion: "Promotion",
content: "Content",
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test src/lib/content/migrationPolicy.test.ts src/lib/admin/access.test.ts src/components/admin/adminNav.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260705120000_story_promotion_center.sql src/lib/content/migrationPolicy.test.ts src/lib/admin/access.ts src/lib/admin/access.test.ts src/components/admin/adminNav.ts src/components/admin/adminNav.test.ts src/components/admin/adminI18n.tsx
git commit -m "feat: add story promotion content foundation"
```

---

## Task 2: Content Domain Types, Schemas, And Publish Rules

**Files:**

- Create: `src/lib/content/types.ts`
- Create: `src/lib/content/schemas.ts`
- Create: `src/lib/content/rules.ts`
- Create: `src/lib/content/rules.test.ts`

- [ ] **Step 1: Write failing domain rule tests**

Create `src/lib/content/rules.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildPublicStoryMapPoint,
  validatePublishableContent,
  validateStoryMapVisibility,
} from "./rules";
import type { ContentDetail } from "./types";

const baseContent: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白已完成疫苗接種，現於暫養家庭康復中。",
  body: "小白在灣仔被救起，現正穩定康復。",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "draft",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "了解領養",
  ctaUrl: "/adoption",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  links: [],
  storyProfile: {
    contentItemId: "content-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: "2026-07-01",
    showOnMap: true,
    publicMapLabel: "灣仔區救援",
    publicLat: 22.277,
    publicLng: 114.173,
    internalAddress: "灣仔後巷 exact address",
    internalLocationNotes: "Reporter details",
    isFeatured: true,
  },
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("content publish rules", () => {
  test("requires rescue story fields before publishing", () => {
    expect(validatePublishableContent({ ...baseContent, title: "" })).toEqual([
      { field: "title", message: "Title is required before publishing" },
    ]);

    expect(validatePublishableContent({ ...baseContent, storyProfile: null })).toContainEqual({
      field: "storyProfile",
      message: "Rescue stories need Story Wall settings before publishing",
    });
  });

  test("requires public-safe map fields when a story is map visible", () => {
    expect(
      validateStoryMapVisibility({
        ...baseContent.storyProfile!,
        publicMapLabel: null,
        publicLat: null,
        publicLng: null,
      }),
    ).toEqual([
      { field: "publicMapLabel", message: "Map label is required when showing this story on the map" },
      { field: "publicLat", message: "Approximate public latitude is required for map stories" },
      { field: "publicLng", message: "Approximate public longitude is required for map stories" },
    ]);
  });

  test("maps story details to public map points without internal location fields", () => {
    expect(buildPublicStoryMapPoint(baseContent)).toEqual({
      id: "content-1",
      slug: "siu-bak-recovery",
      title: "小白康復中",
      animalType: "cat",
      publicStatus: "medical_care",
      rescueRegion: "灣仔",
      publicMapLabel: "灣仔區救援",
      lat: 22.277,
      lng: 114.173,
      latestUpdateTitle: null,
    });
    expect(JSON.stringify(buildPublicStoryMapPoint(baseContent))).not.toContain("exact address");
    expect(JSON.stringify(buildPublicStoryMapPoint(baseContent))).not.toContain("Reporter details");
  });
});
```

- [ ] **Step 2: Run the domain tests and verify they fail**

Run:

```bash
bun test src/lib/content/rules.test.ts
```

Expected: FAIL because the content domain files do not exist.

- [ ] **Step 3: Create content types**

Create `src/lib/content/types.ts` with these exported unions and display types:

```ts
export const contentTypes = ["rescue_story", "event", "charity_market", "report"] as const;
export const contentStatuses = ["draft", "published", "archived"] as const;
export const animalStoryTypes = ["cat", "dog", "mixed", "unknown"] as const;
export const rescuePublicStatuses = [
  "rescued",
  "medical_care",
  "foster_recovery",
  "ready_for_adoption",
  "adopted",
  "sponsor_needed",
  "closed",
] as const;
export const storyUpdateKinds = ["medical", "care", "photo", "foster", "adoption", "general"] as const;
export const storyUpdateVisibilities = ["public", "internal"] as const;
export const socialPlatforms = ["facebook", "instagram", "whatsapp"] as const;
export const socialCopyStatuses = ["draft", "copied", "archived"] as const;
export const notificationDraftStatuses = ["draft", "copied", "sent_manually", "dismissed"] as const;

export type ContentType = (typeof contentTypes)[number];
export type ContentStatus = (typeof contentStatuses)[number];
export type AnimalStoryType = (typeof animalStoryTypes)[number];
export type RescuePublicStatus = (typeof rescuePublicStatuses)[number];
export type StoryUpdateKind = (typeof storyUpdateKinds)[number];
export type StoryUpdateVisibility = (typeof storyUpdateVisibilities)[number];
export type SocialPlatform = (typeof socialPlatforms)[number];
export type SocialCopyStatus = (typeof socialCopyStatuses)[number];
export type NotificationDraftStatus = (typeof notificationDraftStatuses)[number];

export type ContentLink = {
  id: string;
  contentItemId: string;
  linkedType: "animal" | "adoption_case" | "successful_adoption" | "supporter" | "volunteer_activity";
  linkedId: string;
  relationship: "primary_subject" | "related_case" | "adopter" | "volunteer_context" | "other";
  label?: string | null;
  createdAt: string;
};

export type RescueStoryProfile = {
  contentItemId: string;
  animalType: AnimalStoryType;
  publicStatus: RescuePublicStatus;
  rescueRegion: string;
  rescueDate: string | null;
  showOnMap: boolean;
  publicMapLabel: string | null;
  publicLat: number | null;
  publicLng: number | null;
  internalAddress: string | null;
  internalLocationNotes: string | null;
  isFeatured: boolean;
};

export type StoryUpdate = {
  id: string;
  contentItemId: string;
  kind: StoryUpdateKind;
  title: string;
  body: string | null;
  occurredAt: string;
  visibility: StoryUpdateVisibility;
  shouldGenerateAdopterDrafts: boolean;
  media: ContentMedia[];
  createdAt: string;
  updatedAt: string;
};

export type ContentMedia = {
  id: string;
  contentItemId: string;
  storyUpdateId: string | null;
  url: string;
  storageBucket: string;
  storagePath: string;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  createdAt: string;
};

export type SocialCopyVariant = {
  id: string;
  contentItemId: string;
  storyUpdateId: string | null;
  platform: SocialPlatform;
  language: "zh-HK";
  copyText: string;
  hashtags: string[];
  status: SocialCopyStatus;
  createdAt: string;
  updatedAt: string;
};

export type RecipientNotificationDraft = {
  id: string;
  storyUpdateId: string;
  contentItemId: string;
  adoptionCaseId: string | null;
  supporterId: string | null;
  channel: "email" | "whatsapp";
  recipientName: string;
  recipientContact: string;
  subject: string | null;
  body: string;
  status: NotificationDraftStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentSummary = {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  subtitle: string | null;
  summary: string;
  coverMediaId: string | null;
  coverImageUrl: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  storyProfile: RescueStoryProfile | null;
  latestPublicUpdate: StoryUpdate | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentDetail = ContentSummary & {
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  links: ContentLink[];
  media: ContentMedia[];
  updates: StoryUpdate[];
  socialCopies: SocialCopyVariant[];
  notificationDrafts: RecipientNotificationDraft[];
};

export type PublishValidationIssue = {
  field: string;
  message: string;
};

export type PublicStoryMapPoint = {
  id: string;
  slug: string;
  title: string;
  animalType: AnimalStoryType;
  publicStatus: RescuePublicStatus;
  rescueRegion: string;
  publicMapLabel: string;
  lat: number;
  lng: number;
  latestUpdateTitle: string | null;
};
```

- [ ] **Step 4: Create schemas**

Create `src/lib/content/schemas.ts`:

```ts
import { z } from "zod";
import {
  animalStoryTypes,
  contentStatuses,
  contentTypes,
  notificationDraftStatuses,
  rescuePublicStatuses,
  socialCopyStatuses,
  socialPlatforms,
  storyUpdateKinds,
  storyUpdateVisibilities,
} from "./types";

const trimmed = z.string().trim();
const optionalTrimmed = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    const next = value?.trim();
    return next ? next : null;
  });

function numberFromInput(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  }, schema);
}

const boundedPage = numberFromInput(z.number().int().min(1)).catch(1);
const boundedPageSize = numberFromInput(z.number().int().min(1))
  .catch(25)
  .transform((value) => Math.min(value, 50));

export const contentSearchSchema = z.object({
  q: optionalTrimmed.optional().transform((value) => value ?? undefined),
  type: z.enum(contentTypes).optional(),
  status: z.enum(contentStatuses).optional(),
  animalType: z.enum(animalStoryTypes).optional(),
  publicStatus: z.enum(rescuePublicStatuses).optional(),
  rescueRegion: optionalTrimmed.optional().transform((value) => value ?? undefined),
  page: boundedPage.default(1),
  pageSize: boundedPageSize.default(25),
});

export const publicContentSearchSchema = contentSearchSchema.extend({
  status: z.literal("published").optional().default("published"),
});

export const contentInputSchema = z.object({
  type: z.enum(contentTypes),
  slug: trimmed.min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: trimmed.min(1).max(180),
  subtitle: optionalTrimmed,
  summary: trimmed.min(1).max(320),
  body: optionalTrimmed,
  coverMediaId: z.string().uuid().nullable().optional().default(null),
  status: z.enum(contentStatuses).default("draft"),
  publishedAt: z.string().datetime().nullable().optional().default(null),
  ctaLabel: optionalTrimmed,
  ctaUrl: optionalTrimmed,
  seoTitle: optionalTrimmed,
  seoDescription: optionalTrimmed,
  ogTitle: optionalTrimmed,
  ogDescription: optionalTrimmed,
});

export const storyProfileInputSchema = z.object({
  animalType: z.enum(animalStoryTypes),
  publicStatus: z.enum(rescuePublicStatuses),
  rescueRegion: trimmed.min(1).max(80),
  rescueDate: z.string().date().nullable().optional().default(null),
  showOnMap: z.boolean().default(false),
  publicMapLabel: optionalTrimmed,
  publicLat: numberFromInput(z.number().min(-90).max(90)).nullable().optional().default(null),
  publicLng: numberFromInput(z.number().min(-180).max(180)).nullable().optional().default(null),
  internalAddress: optionalTrimmed,
  internalLocationNotes: optionalTrimmed,
  isFeatured: z.boolean().default(false),
});

export const storyUpdateInputSchema = z.object({
  kind: z.enum(storyUpdateKinds),
  title: trimmed.min(1).max(180),
  body: optionalTrimmed,
  occurredAt: z.string().datetime(),
  visibility: z.enum(storyUpdateVisibilities).default("public"),
  shouldGenerateAdopterDrafts: z.boolean().default(false),
});

export const socialCopyStatusSchema = z.object({
  status: z.enum(socialCopyStatuses),
});

export const notificationDraftStatusSchema = z.object({
  status: z.enum(notificationDraftStatuses),
});

export const socialCopyGenerateSchema = z.object({
  platform: z.enum(socialPlatforms).optional(),
  storyUpdateId: z.string().uuid().nullable().optional().default(null),
});

export type ContentSearch = z.infer<typeof contentSearchSchema>;
export type ContentInput = z.infer<typeof contentInputSchema>;
export type StoryProfileInput = z.infer<typeof storyProfileInputSchema>;
export type StoryUpdateInput = z.infer<typeof storyUpdateInputSchema>;
```

- [ ] **Step 5: Create publish and public-safe rules**

Create `src/lib/content/rules.ts`:

```ts
import type {
  ContentDetail,
  PublicStoryMapPoint,
  PublishValidationIssue,
  RescueStoryProfile,
} from "./types";

function blank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

export function validateStoryMapVisibility(profile: RescueStoryProfile): PublishValidationIssue[] {
  if (!profile.showOnMap) return [];
  const issues: PublishValidationIssue[] = [];
  if (blank(profile.publicMapLabel)) {
    issues.push({
      field: "publicMapLabel",
      message: "Map label is required when showing this story on the map",
    });
  }
  if (profile.publicLat === null) {
    issues.push({
      field: "publicLat",
      message: "Approximate public latitude is required for map stories",
    });
  }
  if (profile.publicLng === null) {
    issues.push({
      field: "publicLng",
      message: "Approximate public longitude is required for map stories",
    });
  }
  return issues;
}

export function validatePublishableContent(content: ContentDetail): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  if (blank(content.title)) issues.push({ field: "title", message: "Title is required before publishing" });
  if (blank(content.slug)) issues.push({ field: "slug", message: "Slug is required before publishing" });
  if (blank(content.summary)) issues.push({ field: "summary", message: "Summary is required before publishing" });
  if (!content.coverMediaId && !content.coverImageUrl) {
    issues.push({ field: "coverMediaId", message: "Cover image is required before publishing" });
  }
  if (!content.publishedAt) {
    issues.push({ field: "publishedAt", message: "Published date is required before publishing" });
  }
  if (content.type === "rescue_story") {
    if (!content.storyProfile) {
      issues.push({
        field: "storyProfile",
        message: "Rescue stories need Story Wall settings before publishing",
      });
    } else {
      if (blank(content.storyProfile.rescueRegion)) {
        issues.push({ field: "rescueRegion", message: "Rescue region is required before publishing" });
      }
      issues.push(...validateStoryMapVisibility(content.storyProfile));
    }
  }
  return issues;
}

export function buildPublicStoryMapPoint(content: ContentDetail): PublicStoryMapPoint | null {
  const profile = content.storyProfile;
  if (!profile?.showOnMap) return null;
  if (!profile.publicMapLabel || profile.publicLat === null || profile.publicLng === null) return null;
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    animalType: profile.animalType,
    publicStatus: profile.publicStatus,
    rescueRegion: profile.rescueRegion,
    publicMapLabel: profile.publicMapLabel,
    lat: profile.publicLat,
    lng: profile.publicLng,
    latestUpdateTitle: content.latestPublicUpdate?.title ?? null,
  };
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun test src/lib/content/rules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/content/types.ts src/lib/content/schemas.ts src/lib/content/rules.ts src/lib/content/rules.test.ts
git commit -m "feat: add content publishing domain rules"
```

---

## Task 3: Social Copy And Adopter Draft Helpers

**Files:**

- Create: `src/lib/content/socialCopy.ts`
- Create: `src/lib/content/socialCopy.test.ts`
- Create: `src/lib/content/notificationDrafts.ts`
- Create: `src/lib/content/notificationDrafts.test.ts`

- [ ] **Step 1: Write failing social copy tests**

Create `src/lib/content/socialCopy.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { generateSocialCopyVariants } from "./socialCopy";
import type { ContentDetail, StoryUpdate } from "./types";

const latestUpdate: StoryUpdate = {
  id: "update-1",
  contentItemId: "content-1",
  kind: "medical",
  title: "已完成疫苗接種",
  body: "小白現於暫養家庭康復中。",
  occurredAt: "2026-07-05T10:00:00.000Z",
  visibility: "public",
  shouldGenerateAdopterDrafts: true,
  media: [],
  createdAt: "2026-07-05T10:00:00.000Z",
  updatedAt: "2026-07-05T10:00:00.000Z",
};

const content: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白由義工救起，正在接受醫療照護。",
  body: "救援故事正文",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "published",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "支持救援",
  ctaUrl: "/donate",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: {
    contentItemId: "content-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: "2026-07-01",
    showOnMap: true,
    publicMapLabel: "灣仔區救援",
    publicLat: 22.277,
    publicLng: 114.173,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: latestUpdate,
  links: [],
  media: [],
  updates: [latestUpdate],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("social copy generation", () => {
  test("generates zh-HK Facebook, Instagram, and WhatsApp variants", () => {
    const variants = generateSocialCopyVariants({
      content,
      storyUpdate: latestUpdate,
      publicUrl: "https://hkscda.org/stories/siu-bak-recovery",
    });

    expect(variants.map((variant) => variant.platform)).toEqual(["facebook", "instagram", "whatsapp"]);
    expect(variants[0].copyText).toContain("小白康復中");
    expect(variants[0].copyText).toContain("已完成疫苗接種");
    expect(variants[0].copyText).toContain("https://hkscda.org/stories/siu-bak-recovery");
    expect(variants[1].hashtags).toContain("#香港拯救貓狗協會");
    expect(variants[2].copyText).toContain("可按以下連結了解");
  });
});
```

- [ ] **Step 2: Write failing notification draft helper tests**

Create `src/lib/content/notificationDrafts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildAdopterNotificationDrafts } from "./notificationDrafts";

describe("adopter notification draft helpers", () => {
  test("creates email and whatsapp drafts for unique adopter contacts", () => {
    const drafts = buildAdopterNotificationDrafts({
      contentItemId: "content-1",
      storyUpdateId: "update-1",
      storyTitle: "小白康復中",
      updateTitle: "已完成疫苗接種",
      updateBody: "小白現於暫養家庭康復中。",
      publicUrl: "https://hkscda.org/stories/siu-bak-recovery",
      recipients: [
        {
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          name: "陳小姐",
          email: "ada@example.com",
          phone: "91234567",
        },
        {
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          name: "陳小姐",
          email: "ada@example.com",
          phone: "91234567",
        },
      ],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.channel)).toEqual(["email", "whatsapp"]);
    expect(drafts[0]).toMatchObject({
      contentItemId: "content-1",
      storyUpdateId: "update-1",
      adoptionCaseId: "case-1",
      supporterId: "supporter-1",
      recipientName: "陳小姐",
      recipientContact: "ada@example.com",
      status: "draft",
    });
    expect(drafts[0].body).toContain("已完成疫苗接種");
    expect(drafts[0].body).toContain("https://hkscda.org/stories/siu-bak-recovery");
  });
});
```

- [ ] **Step 3: Run helper tests and verify they fail**

Run:

```bash
bun test src/lib/content/socialCopy.test.ts src/lib/content/notificationDrafts.test.ts
```

Expected: FAIL because helper files do not exist.

- [ ] **Step 4: Implement social copy generation**

Create `src/lib/content/socialCopy.ts`:

```ts
import type { ContentDetail, SocialPlatform, StoryUpdate } from "./types";

type SocialCopyDraft = {
  platform: SocialPlatform;
  language: "zh-HK";
  copyText: string;
  hashtags: string[];
};

type GenerateSocialCopyInput = {
  content: ContentDetail;
  storyUpdate?: StoryUpdate | null;
  publicUrl: string;
};

const baseTags = ["#香港拯救貓狗協會", "#領養代替購買", "#支持救援"];

function storyLine(content: ContentDetail, storyUpdate?: StoryUpdate | null) {
  const updateLine = storyUpdate ? `\n\n最新更新：${storyUpdate.title}${storyUpdate.body ? `\n${storyUpdate.body}` : ""}` : "";
  const region = content.storyProfile?.rescueRegion ? `\n地區：${content.storyProfile.rescueRegion}` : "";
  return `${content.title}\n\n${content.summary}${updateLine}${region}`;
}

export function generateSocialCopyVariants(input: GenerateSocialCopyInput): SocialCopyDraft[] {
  const core = storyLine(input.content, input.storyUpdate);
  return [
    {
      platform: "facebook",
      language: "zh-HK",
      copyText: `${core}\n\n詳情：${input.publicUrl}`,
      hashtags: baseTags,
    },
    {
      platform: "instagram",
      language: "zh-HK",
      copyText: `${core}\n\n詳情請到 bio 或網站查看。\n${baseTags.join(" ")}`,
      hashtags: baseTags,
    },
    {
      platform: "whatsapp",
      language: "zh-HK",
      copyText: `${input.content.title}\n${input.content.summary}\n\n可按以下連結了解：${input.publicUrl}`,
      hashtags: [],
    },
  ];
}
```

- [ ] **Step 5: Implement adopter notification drafts**

Create `src/lib/content/notificationDrafts.ts`:

```ts
import type { RecipientNotificationDraft } from "./types";

export type AdopterNotificationRecipient = {
  adoptionCaseId: string | null;
  supporterId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
};

type BuildDraftsInput = {
  contentItemId: string;
  storyUpdateId: string;
  storyTitle: string;
  updateTitle: string;
  updateBody: string | null;
  publicUrl: string;
  recipients: AdopterNotificationRecipient[];
};

function dedupeKey(recipient: AdopterNotificationRecipient, channel: "email" | "whatsapp") {
  const contact = channel === "email" ? recipient.email : recipient.phone;
  return `${channel}:${contact ?? ""}`;
}

function body(input: BuildDraftsInput, recipient: AdopterNotificationRecipient) {
  return `${recipient.name} 您好，\n\n${input.storyTitle} 有新的近況更新：${input.updateTitle}\n${
    input.updateBody ?? ""
  }\n\n詳情可查看：${input.publicUrl}\n\n香港拯救貓狗協會`;
}

export function buildAdopterNotificationDrafts(
  input: BuildDraftsInput,
): Array<
  Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">
> {
  const seen = new Set<string>();
  const drafts: Array<Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">> = [];

  for (const recipient of input.recipients) {
    for (const channel of ["email", "whatsapp"] as const) {
      const contact = channel === "email" ? recipient.email : recipient.phone;
      if (!contact) continue;
      const key = dedupeKey(recipient, channel);
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push({
        storyUpdateId: input.storyUpdateId,
        contentItemId: input.contentItemId,
        adoptionCaseId: recipient.adoptionCaseId,
        supporterId: recipient.supporterId,
        channel,
        recipientName: recipient.name,
        recipientContact: contact,
        subject: channel === "email" ? `${input.storyTitle} 近況更新：${input.updateTitle}` : null,
        body: body(input, recipient),
        status: "draft",
      });
    }
  }

  return drafts;
}
```

- [ ] **Step 6: Run helper tests**

Run:

```bash
bun test src/lib/content/socialCopy.test.ts src/lib/content/notificationDrafts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/content/socialCopy.ts src/lib/content/socialCopy.test.ts src/lib/content/notificationDrafts.ts src/lib/content/notificationDrafts.test.ts
git commit -m "feat: add story copy and adopter draft helpers"
```

---

## Task 4: Content Service

**Files:**

- Create: `src/lib/content/service.ts`
- Create: `src/lib/content/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/lib/content/service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createContentService, type ContentRepository } from "./service";
import type { ContentDetail } from "./types";

const detail: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在康復。",
  body: "救援故事正文",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "draft",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "支持救援",
  ctaUrl: "/donate",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: {
    contentItemId: "content-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: "2026-07-01",
    showOnMap: false,
    publicMapLabel: null,
    publicLat: null,
    publicLng: null,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

function createRepo(overrides: Partial<ContentRepository> = {}) {
  const auditLogs: unknown[] = [];
  const socialCopies: unknown[] = [];
  const notificationDrafts: unknown[] = [];
  const repo: ContentRepository = {
    listPublicContent: async () => ({ items: [detail], total: 1 }),
    getPublicContentBySlug: async () => detail,
    listPublicMapStories: async () => [],
    listAdminContent: async () => ({ items: [detail], total: 1 }),
    getAdminContent: async () => detail,
    createContent: async () => "content-1",
    updateContent: async () => detail,
    publishContent: async () => ({ ...detail, status: "published" }),
    archiveContent: async () => ({ ...detail, status: "archived" }),
    insertSocialCopies: async (rows) => socialCopies.push(...rows),
    getStoryUpdate: async () => ({
      id: "update-1",
      contentItemId: "content-1",
      kind: "medical",
      title: "已完成疫苗接種",
      body: "小白現於暫養家庭康復中。",
      occurredAt: "2026-07-05T10:00:00.000Z",
      visibility: "public",
      shouldGenerateAdopterDrafts: true,
      media: [],
      createdAt: "2026-07-05T10:00:00.000Z",
      updatedAt: "2026-07-05T10:00:00.000Z",
    }),
    resolveAdopterRecipients: async () => [
      {
        adoptionCaseId: "case-1",
        supporterId: "supporter-1",
        name: "陳小姐",
        email: "ada@example.com",
        phone: "91234567",
      },
    ],
    insertNotificationDrafts: async (rows) => notificationDrafts.push(...rows),
    updateNotificationDraftStatus: async () => undefined,
    updateSocialCopyStatus: async () => undefined,
    insertAuditLog: async (row) => auditLogs.push(row),
    ...overrides,
  };
  return { repo, auditLogs, socialCopies, notificationDrafts };
}

describe("content service", () => {
  test("blocks publishing invalid content with field-level issues", async () => {
    const { repo } = createRepo({
      getAdminContent: async () => ({ ...detail, coverMediaId: null, coverImageUrl: null }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://hkscda.org" });

    await expect(
      service.publishContent({ actorUserId: "admin-user", contentId: "content-1" }),
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      issues: [{ field: "coverMediaId", message: "Cover image is required before publishing" }],
    });
  });

  test("publishes valid content and audits the action", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://hkscda.org" });

    await expect(
      service.publishContent({ actorUserId: "admin-user", contentId: "content-1" }),
    ).resolves.toMatchObject({ status: "published" });
    expect(auditLogs).toMatchObject([
      {
        actor_user_id: "admin-user",
        action: "content.publish",
        entity: "content_item",
        entity_id: "content-1",
      },
    ]);
  });

  test("generates social copy and adopter notification drafts", async () => {
    const { repo, socialCopies, notificationDrafts } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://hkscda.org" });

    await service.generateSocialCopy({
      actorUserId: "admin-user",
      contentId: "content-1",
      input: { storyUpdateId: "update-1" },
    });
    await service.generateNotificationDrafts({
      actorUserId: "admin-user",
      storyUpdateId: "update-1",
    });

    expect(socialCopies).toHaveLength(3);
    expect(notificationDrafts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
bun test src/lib/content/service.test.ts
```

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Implement service contract and orchestration**

Create `src/lib/content/service.ts` with:

```ts
import { z } from "zod";
import { buildAdopterNotificationDrafts, type AdopterNotificationRecipient } from "./notificationDrafts";
import { validatePublishableContent } from "./rules";
import {
  contentInputSchema,
  contentSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
} from "./schemas";
import { generateSocialCopyVariants } from "./socialCopy";
import type {
  ContentDetail,
  ContentSummary,
  PublicStoryMapPoint,
  RecipientNotificationDraft,
  SocialCopyVariant,
  StoryUpdate,
} from "./types";

export class ContentValidationError extends Error {
  name = "ContentValidationError";
  constructor(public issues: Array<{ field: string; message: string }>) {
    super("Content validation failed");
  }
}

export type ContentAuditLogInsert = {
  actor_user_id: string | null;
  action: string;
  entity: "content_item" | "story_update" | "social_copy_variant" | "recipient_notification_draft";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp?: string;
};

export type ContentRepository = {
  listPublicContent(input: z.infer<typeof publicContentSearchSchema>): Promise<{ items: ContentSummary[]; total: number }>;
  getPublicContentBySlug(slug: string): Promise<ContentDetail | null>;
  listPublicMapStories(input: z.infer<typeof publicContentSearchSchema>): Promise<PublicStoryMapPoint[]>;
  listAdminContent(input: z.infer<typeof contentSearchSchema>): Promise<{ items: ContentSummary[]; total: number }>;
  getAdminContent(id: string): Promise<ContentDetail | null>;
  createContent(input: z.infer<typeof contentInputSchema>): Promise<string>;
  updateContent(id: string, input: Partial<z.infer<typeof contentInputSchema>>): Promise<ContentDetail>;
  publishContent(id: string): Promise<ContentDetail>;
  archiveContent(id: string): Promise<ContentDetail>;
  insertSocialCopies(rows: Array<Omit<SocialCopyVariant, "id" | "createdAt" | "updatedAt">>): Promise<void>;
  getStoryUpdate(id: string): Promise<StoryUpdate | null>;
  resolveAdopterRecipients(contentId: string): Promise<AdopterNotificationRecipient[]>;
  insertNotificationDrafts(rows: Array<Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">>): Promise<void>;
  updateNotificationDraftStatus(id: string, status: RecipientNotificationDraft["status"]): Promise<void>;
  updateSocialCopyStatus(id: string, status: SocialCopyVariant["status"]): Promise<void>;
  insertAuditLog(row: ContentAuditLogInsert): Promise<void>;
};

type ContentServiceArgs = {
  repo: ContentRepository;
  now?: () => Date;
  publicBaseUrl: string;
};

function publicStoryUrl(publicBaseUrl: string, slug: string) {
  return `${publicBaseUrl.replace(/\/+$/, "")}/stories/${encodeURIComponent(slug)}`;
}

function timestamp(now: () => Date) {
  return now().toISOString();
}

export function createContentService({ repo, now = () => new Date(), publicBaseUrl }: ContentServiceArgs) {
  return {
    listPublicContent(raw: unknown) {
      return repo.listPublicContent(publicContentSearchSchema.parse(raw));
    },
    getPublicContentBySlug(slug: string) {
      return repo.getPublicContentBySlug(slug);
    },
    listPublicMapStories(raw: unknown) {
      return repo.listPublicMapStories(publicContentSearchSchema.parse(raw));
    },
    listAdminContent(raw: unknown) {
      return repo.listAdminContent(contentSearchSchema.parse(raw));
    },
    getAdminContent(id: string) {
      return repo.getAdminContent(id);
    },
    async createContent(args: { actorUserId: string; input: unknown }) {
      const input = contentInputSchema.parse(args.input);
      const id = await repo.createContent(input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "content.create",
        entity: "content_item",
        entity_id: id,
        timestamp: timestamp(now),
        detail: { type: input.type, title: input.title, status: input.status },
      });
      return { id };
    },
    async updateContent(args: { actorUserId: string; contentId: string; input: unknown }) {
      const input = contentInputSchema.partial().parse(args.input);
      const content = await repo.updateContent(args.contentId, input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "content.update",
        entity: "content_item",
        entity_id: args.contentId,
        timestamp: timestamp(now),
        detail: input,
      });
      return content;
    },
    async publishContent(args: { actorUserId: string; contentId: string }) {
      const content = await repo.getAdminContent(args.contentId);
      if (!content) throw new Error("Content item not found");
      const issues = validatePublishableContent(content);
      if (issues.length > 0) throw new ContentValidationError(issues);
      const published = await repo.publishContent(args.contentId);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "content.publish",
        entity: "content_item",
        entity_id: args.contentId,
        timestamp: timestamp(now),
        detail: { slug: published.slug },
      });
      return published;
    },
    async archiveContent(args: { actorUserId: string; contentId: string }) {
      const archived = await repo.archiveContent(args.contentId);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "content.archive",
        entity: "content_item",
        entity_id: args.contentId,
        timestamp: timestamp(now),
        detail: { slug: archived.slug },
      });
      return archived;
    },
    async generateSocialCopy(args: { actorUserId: string; contentId: string; input: unknown }) {
      const input = socialCopyGenerateSchema.parse(args.input);
      const content = await repo.getAdminContent(args.contentId);
      if (!content) throw new Error("Content item not found");
      const storyUpdate = input.storyUpdateId ? await repo.getStoryUpdate(input.storyUpdateId) : null;
      const variants = generateSocialCopyVariants({
        content,
        storyUpdate,
        publicUrl: publicStoryUrl(publicBaseUrl, content.slug),
      })
        .filter((variant) => !input.platform || variant.platform === input.platform)
        .map((variant) => ({
          contentItemId: content.id,
          storyUpdateId: storyUpdate?.id ?? null,
          platform: variant.platform,
          language: variant.language,
          copyText: variant.copyText,
          hashtags: variant.hashtags,
          status: "draft" as const,
        }));
      await repo.insertSocialCopies(variants);
      return { count: variants.length };
    },
    async updateSocialCopyStatus(args: { actorUserId: string; copyId: string; input: unknown }) {
      const input = socialCopyStatusSchema.parse(args.input);
      await repo.updateSocialCopyStatus(args.copyId, input.status);
      return { ok: true };
    },
    async generateNotificationDrafts(args: { actorUserId: string; storyUpdateId: string }) {
      const update = await repo.getStoryUpdate(args.storyUpdateId);
      if (!update) throw new Error("Story update not found");
      const content = await repo.getAdminContent(update.contentItemId);
      if (!content) throw new Error("Content item not found");
      const recipients = await repo.resolveAdopterRecipients(content.id);
      const drafts = buildAdopterNotificationDrafts({
        contentItemId: content.id,
        storyUpdateId: update.id,
        storyTitle: content.title,
        updateTitle: update.title,
        updateBody: update.body,
        publicUrl: publicStoryUrl(publicBaseUrl, content.slug),
        recipients,
      });
      await repo.insertNotificationDrafts(drafts);
      return { count: drafts.length };
    },
    async updateNotificationDraftStatus(args: { actorUserId: string; draftId: string; input: unknown }) {
      const input = notificationDraftStatusSchema.parse(args.input);
      await repo.updateNotificationDraftStatus(args.draftId, input.status);
      return { ok: true };
    },
  };
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
bun test src/lib/content/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/service.ts src/lib/content/service.test.ts
git commit -m "feat: add story promotion content service"
```

---

## Task 5: Supabase Repository And Mapping

**Files:**

- Create: `src/lib/content/repository.server.ts`
- Create: `src/lib/content/repositoryMapping.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `src/lib/content/repositoryMapping.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { toContentSummary, toStoryUpdate } from "./repository.server";

describe("content repository mapping", () => {
  test("maps content rows into camelCase summaries", () => {
    expect(
      toContentSummary({
        id: "content-1",
        slug: "siu-bak",
        type: "rescue_story",
        title: "小白",
        subtitle: null,
        summary: "康復中",
        body: null,
        cover_media_id: "media-1",
        status: "published",
        published_at: "2026-07-05T10:00:00.000Z",
        cta_label: "支持",
        cta_url: "/donate",
        seo_title: null,
        seo_description: null,
        og_title: null,
        og_description: null,
        created_at: "2026-07-05T09:00:00.000Z",
        updated_at: "2026-07-05T09:00:00.000Z",
      }),
    ).toMatchObject({
      id: "content-1",
      slug: "siu-bak",
      type: "rescue_story",
      title: "小白",
      coverMediaId: "media-1",
      status: "published",
      latestPublicUpdate: null,
    });
  });

  test("maps story updates with attached media", () => {
    expect(
      toStoryUpdate(
        {
          id: "update-1",
          content_item_id: "content-1",
          kind: "medical",
          title: "疫苗完成",
          body: null,
          occurred_at: "2026-07-05T10:00:00.000Z",
          visibility: "public",
          should_generate_adopter_drafts: true,
          created_at: "2026-07-05T10:00:00.000Z",
          updated_at: "2026-07-05T10:00:00.000Z",
        },
        [],
      ),
    ).toMatchObject({
      id: "update-1",
      contentItemId: "content-1",
      kind: "medical",
      shouldGenerateAdopterDrafts: true,
      media: [],
    });
  });
});
```

- [ ] **Step 2: Run mapper tests and verify they fail**

Run:

```bash
bun test src/lib/content/repositoryMapping.test.ts
```

Expected: FAIL because `repository.server.ts` does not exist.

- [ ] **Step 3: Implement repository mapping and methods**

Create `src/lib/content/repository.server.ts` with these public exports and method responsibilities:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPublicStoryMapPoint } from "./rules";
import type { ContentSearch } from "./schemas";
import type { ContentRepository } from "./service";
import type {
  ContentDetail,
  ContentMedia,
  ContentSummary,
  RescueStoryProfile,
  StoryUpdate,
} from "./types";

type ContentRow = {
  id: string;
  slug: string;
  type: ContentSummary["type"];
  title: string;
  subtitle: string | null;
  summary: string;
  body: string | null;
  cover_media_id: string | null;
  status: ContentSummary["status"];
  published_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  created_at: string;
  updated_at: string;
};

type StoryUpdateRow = {
  id: string;
  content_item_id: string;
  kind: StoryUpdate["kind"];
  title: string;
  body: string | null;
  occurred_at: string;
  visibility: StoryUpdate["visibility"];
  should_generate_adopter_drafts: boolean;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  content_item_id: string;
  story_update_id: string | null;
  storage_bucket: string;
  storage_path: string;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
};

export function toContentSummary(row: ContentRow): ContentSummary {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: row.cover_media_id,
    coverImageUrl: null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toContentMedia(row: MediaRow, publicUrl: string | null): ContentMedia {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    storyUpdateId: row.story_update_id,
    url: publicUrl ?? row.storage_path,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    altText: row.alt_text,
    caption: row.caption,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    createdAt: row.created_at,
  };
}

export function toStoryUpdate(row: StoryUpdateRow, media: ContentMedia[]): StoryUpdate {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    occurredAt: row.occurred_at,
    visibility: row.visibility,
    shouldGenerateAdopterDrafts: row.should_generate_adopter_drafts,
    media,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

In the same file, implement `createSupabaseContentRepository(client: SupabaseClient): ContentRepository` with these methods:

- `listPublicContent`: select `content_item` rows where `status = published`, apply type/search/story filters, hydrate details, return summaries.
- `getPublicContentBySlug`: fetch a published item by slug, hydrate detail, filter updates to `visibility = public`, and clear `internalAddress` plus `internalLocationNotes` before returning.
- `listPublicMapStories`: hydrate published story details and return `buildPublicStoryMapPoint(content)` results with nulls removed.
- `listAdminContent`: select all statuses using admin filters and hydrate summaries.
- `getAdminContent`: return full detail including internal story profile, social copies, and notification drafts.
- `createContent`, `updateContent`, `publishContent`, and `archiveContent`: map camelCase payloads to snake_case rows.
- `insertSocialCopies`, `updateSocialCopyStatus`, `insertNotificationDrafts`, and `updateNotificationDraftStatus`: write the draft tables.
- `getStoryUpdate`: return one update by id with attached media.
- `resolveAdopterRecipients`: find `content_link` rows for `adoption_case` and `successful_adoption`, load adoption/supporter contact data, and return unique recipients.
- `insertAuditLog`: insert into the existing `audit_log` table with `entity = "content_item"` style metadata matching the volunteer audit approach.

The helper that hydrates a detail must load rows in this order: content row, profile, links, media, updates, social copy variants, notification drafts. Cover image URL should come from the cover media row when available; otherwise use the first media row marked `is_cover`.

- [ ] **Step 4: Run mapper tests**

Run:

```bash
bun test src/lib/content/repositoryMapping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/repository.server.ts src/lib/content/repositoryMapping.test.ts
git commit -m "feat: add content supabase repository"
```

---

## Task 6: HTTP Handlers And Route Files

**Files:**

- Create: `src/lib/content/http.server.ts`
- Create: `src/lib/content/http.test.ts`
- Create: `src/routes/api/stories.ts`
- Create: `src/routes/api/stories/$slug.ts`
- Create: `src/routes/api/stories/map.ts`
- Create: `src/routes/api/admin/content/-handlers.ts`
- Create: `src/routes/api/admin/content/index.ts`
- Create: `src/routes/api/admin/content/$id.ts`
- Create: `src/routes/api/admin/content/$id/publish.ts`
- Create: `src/routes/api/admin/content/$id/archive.ts`
- Create: `src/routes/api/admin/content/$id/social-copy.ts`
- Create: `src/routes/api/admin/content/updates/$updateId/notification-drafts.ts`
- Create: `src/routes/api/admin/content/notification-drafts/$id.ts`
- Create: `src/routes/api/admin/content/social-copy/$id.ts`

- [ ] **Step 1: Write failing handler tests**

Create `src/lib/content/http.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { AdminUser } from "../donations/supabase.server";
import { ContentValidationError } from "./service";
import { createContentHandlers } from "./http.server";

const admin: AdminUser = {
  id: "admin-row",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

function createService(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    async listPublicContent() {
      calls.push("listPublicContent");
      return { items: [{ id: "content-1", title: "小白" }], total: 1 };
    },
    async getPublicContentBySlug() {
      calls.push("getPublicContentBySlug");
      return { id: "content-1", slug: "siu-bak", title: "小白" };
    },
    async listPublicMapStories() {
      calls.push("listPublicMapStories");
      return [{ id: "content-1", title: "小白", lat: 22.277, lng: 114.173 }];
    },
    async listAdminContent() {
      calls.push("listAdminContent");
      return { items: [], total: 0 };
    },
    async createContent() {
      calls.push("createContent");
      return { id: "content-1" };
    },
    async getAdminContent() {
      calls.push("getAdminContent");
      return { id: "content-1", title: "小白" };
    },
    async updateContent() {
      calls.push("updateContent");
      return { id: "content-1", title: "小白 updated" };
    },
    async publishContent() {
      calls.push("publishContent");
      return { id: "content-1", status: "published" };
    },
    async archiveContent() {
      calls.push("archiveContent");
      return { id: "content-1", status: "archived" };
    },
    async generateSocialCopy() {
      calls.push("generateSocialCopy");
      return { count: 3 };
    },
    async generateNotificationDrafts() {
      calls.push("generateNotificationDrafts");
      return { count: 2 };
    },
    async updateNotificationDraftStatus() {
      calls.push("updateNotificationDraftStatus");
      return { ok: true };
    },
    async updateSocialCopyStatus() {
      calls.push("updateSocialCopyStatus");
      return { ok: true };
    },
    ...overrides,
  };
}

describe("createContentHandlers", () => {
  test("returns public content with no-store cache headers", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.listPublicContent({
      request: new Request("https://example.test/api/stories"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [{ id: "content-1", title: "小白" }], total: 1 });
  });

  test("rejects admin requests before service work when auth is missing", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service,
    });

    const response = await handlers.listAdminContent({
      request: new Request("https://example.test/api/admin/content"),
    });

    expect(response.status).toBe(401);
    expect(service.calls).toEqual([]);
  });

  test("maps publish validation errors to field-level 400 responses", async () => {
    const service = createService({
      async publishContent() {
        throw new ContentValidationError([
          { field: "coverMediaId", message: "Cover image is required before publishing" },
        ]);
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.publishContent({
      request: new Request("https://example.test/api/admin/content/content-1/publish", { method: "POST" }),
      params: { id: "99999999-aaaa-4333-8444-555555555555" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Content item cannot be published",
      issues: [{ field: "coverMediaId", message: "Cover image is required before publishing" }],
    });
  });

  test("maps zod errors to admin 400 responses", async () => {
    const service = createService({
      async createContent() {
        throw new z.ZodError([]);
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.createContent({
      request: new Request("https://example.test/api/admin/content", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid content management request" });
  });
});
```

- [ ] **Step 2: Run handler tests and verify they fail**

Run:

```bash
bun test src/lib/content/http.test.ts
```

Expected: FAIL because `http.server.ts` does not exist.

- [ ] **Step 3: Implement handlers**

Create `src/lib/content/http.server.ts` with the same helper shape as `src/lib/volunteers/http.server.ts`: `searchParams`, `jsonBody`, `jsonResponse`, `requiredId`, and `withContentErrors`.

Required behavior:

- `jsonResponse` always sets `cache-control: no-store`.
- Public handler errors return `Could not load story content`.
- Admin handler zod errors return `Invalid content management request`.
- `ContentValidationError` returns status `400` and body `{ error: "Content item cannot be published", issues }`.
- `requiredId` accepts uuid params and returns `400` with `{ error: "Invalid content id" }`.

Export `createContentHandlers({ requireContentAdmin, service })` with methods matching every route file listed in this task.

- [ ] **Step 4: Run handler tests**

Run:

```bash
bun test src/lib/content/http.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add route handler factory**

Create `src/routes/api/admin/content/-handlers.ts`:

```ts
import { createContentHandlers } from "../../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../../lib/content/repository.server";
import { createContentService } from "../../../../lib/content/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createContentService({
      repo: createSupabaseContentRepository(client),
      publicBaseUrl,
    }),
  });
}
```

- [ ] **Step 6: Add route files**

Use this route pattern for each admin route, changing the file route string and handler method:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/content")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAdminContent({ request }),
      POST: ({ request }) => createHandlers().createContent({ request }),
    },
  },
});
```

For nested files, import `createHandlers` from the correct relative `../-handlers` path. Public routes instantiate the service directly with a service-role repository and expose:

- `/api/stories` -> `listPublicContent`
- `/api/stories/$slug` -> `getPublicContent`
- `/api/stories/map` -> `listPublicMapStories`

- [ ] **Step 7: Run handler tests and build route tree**

Run:

```bash
bun test src/lib/content/http.test.ts
bun run build
```

Expected: tests PASS and build PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content/http.server.ts src/lib/content/http.test.ts src/routes/api/stories src/routes/api/admin/content
git commit -m "feat: add story content api handlers"
```

---

## Task 7: Admin Content List And Editor UI

**Files:**

- Create: `src/components/admin/content/contentAdminLogic.ts`
- Create: `src/components/admin/content/contentAdminLogic.test.ts`
- Create: `src/components/admin/content/ContentManagement.tsx`
- Create: `src/components/admin/content/ContentEditor.tsx`
- Create: `src/components/admin/content/ContentTimeline.tsx`
- Create: `src/components/admin/content/SocialCopyPanel.tsx`
- Create: `src/components/admin/content/NotificationDraftPanel.tsx`
- Create: `src/components/admin/content/ContentManagement.test.tsx`
- Create: `src/routes/admin/content.tsx`
- Create: `src/routes/admin/content/$id.tsx`

- [ ] **Step 1: Write failing admin logic tests**

Create `src/components/admin/content/contentAdminLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildContentSearchParams,
  contentStatusTone,
  formatContentTypeLabel,
  summarizeContentRows,
} from "./contentAdminLogic";

describe("content admin logic", () => {
  test("builds bounded content search params", () => {
    expect(
      buildContentSearchParams({
        q: "  小白 ",
        type: "rescue_story",
        status: "published",
        rescueRegion: "灣仔",
        page: 2,
      }).toString(),
    ).toBe("q=%E5%B0%8F%E7%99%BD&type=rescue_story&status=published&rescueRegion=%E7%81%A3%E4%BB%94&page=2&pageSize=25");
  });

  test("maps status and type labels", () => {
    expect(contentStatusTone("published")).toBe("success");
    expect(contentStatusTone("draft")).toBe("warning");
    expect(contentStatusTone("archived")).toBe("muted");
    expect(formatContentTypeLabel("charity_market", "zh")).toBe("慈善市集");
    expect(formatContentTypeLabel("report", "en")).toBe("Report");
  });

  test("summarizes rows for operational cards", () => {
    expect(
      summarizeContentRows([
        { type: "rescue_story", status: "published" },
        { type: "rescue_story", status: "draft" },
        { type: "event", status: "published" },
      ]),
    ).toEqual({ total: 3, published: 2, drafts: 1, rescueStories: 2 });
  });
});
```

- [ ] **Step 2: Run admin logic tests and verify they fail**

Run:

```bash
bun test src/components/admin/content/contentAdminLogic.test.ts
```

Expected: FAIL because the admin content logic file does not exist.

- [ ] **Step 3: Implement admin logic helpers**

Create `src/components/admin/content/contentAdminLogic.ts`:

```ts
import type { ContentStatus, ContentType } from "../../../lib/content/types";

type SearchInput = {
  q?: string;
  type?: ContentType | "all";
  status?: ContentStatus | "all";
  rescueRegion?: string;
  page?: number;
  pageSize?: number;
};

export function buildContentSearchParams(input: SearchInput) {
  const params = new URLSearchParams();
  const q = input.q?.trim();
  if (q) params.set("q", q);
  if (input.type && input.type !== "all") params.set("type", input.type);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.rescueRegion?.trim()) params.set("rescueRegion", input.rescueRegion.trim());
  params.set("page", String(Math.max(1, input.page ?? 1)));
  params.set("pageSize", String(Math.min(Math.max(1, input.pageSize ?? 25), 50)));
  return params;
}

export function contentStatusTone(status: ContentStatus) {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "muted";
}

export function formatContentTypeLabel(type: ContentType, language: "zh" | "en") {
  const labels = {
    rescue_story: { zh: "救援故事", en: "Rescue story" },
    event: { zh: "活動", en: "Event" },
    charity_market: { zh: "慈善市集", en: "Charity market" },
    report: { zh: "報導", en: "Report" },
  };
  return labels[type][language];
}

export function summarizeContentRows(rows: Array<{ type: ContentType; status: ContentStatus }>) {
  return {
    total: rows.length,
    published: rows.filter((row) => row.status === "published").length,
    drafts: rows.filter((row) => row.status === "draft").length,
    rescueStories: rows.filter((row) => row.type === "rescue_story").length,
  };
}
```

- [ ] **Step 4: Add admin component smoke test**

Create `src/components/admin/content/ContentManagement.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentManagement } from "./ContentManagement";

describe("ContentManagement", () => {
  test("renders content rows and filters", () => {
    const markup = renderToStaticMarkup(
      <ContentManagement
        initialData={{
          items: [
            {
              id: "content-1",
              slug: "siu-bak",
              type: "rescue_story",
              title: "小白康復中",
              subtitle: null,
              summary: "小白正在康復。",
              coverMediaId: null,
              coverImageUrl: null,
              status: "published",
              publishedAt: "2026-07-05T10:00:00.000Z",
              ctaLabel: null,
              ctaUrl: null,
              storyProfile: null,
              latestPublicUpdate: null,
              createdAt: "2026-07-05T09:00:00.000Z",
              updatedAt: "2026-07-05T09:00:00.000Z",
            },
          ],
          total: 1,
        }}
      />,
    );

    expect(markup).toContain("宣傳內容");
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("救援故事");
  });
});
```

- [ ] **Step 5: Implement admin list and editor**

Implement:

- `ContentManagement.tsx`: summary cards, search input, type/status filters, and a `DataTable` with title, type, status, published date, rescue region, and edit link.
- `ContentEditor.tsx`: tabs or sections for basic content, linked records, Story Wall settings, updates, social copy, and notification drafts.
- `ContentTimeline.tsx`: compact update timeline with kind/status labels and public/internal visibility.
- `SocialCopyPanel.tsx`: platform cards with copy text, hashtags, and copy/mark-copied actions.
- `NotificationDraftPanel.tsx`: recipient, channel, status, body, copy, sent-manually, and dismiss actions.

Use existing `fetch` calls to `/api/admin/content` endpoints. Keep mutation buttons disabled while pending and show field-level publish validation messages returned by the API.

- [ ] **Step 6: Add admin routes**

Create `src/routes/admin/content.tsx`:

```tsx
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ContentManagement } from "../../components/admin/content/ContentManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content")({
  beforeLoad: async () => {
    await requireAdminPageAccess("contentManagement");
  },
  component: AdminContentPage,
});

function AdminContentPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/admin/content" && pathname !== "/admin/content/") return <Outlet />;

  return (
    <AdminLayout activeSection="content">
      <ContentManagement />
    </AdminLayout>
  );
}
```

Create `src/routes/admin/content/$id.tsx` with `beforeLoad` using `contentManagement`, `AdminLayout activeSection="content"`, and `ContentEditor`.

- [ ] **Step 7: Run admin UI tests**

Run:

```bash
bun test src/components/admin/content/contentAdminLogic.test.ts src/components/admin/content/ContentManagement.test.tsx src/lib/admin/access.test.ts src/components/admin/adminNav.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/content src/routes/admin/content.tsx 'src/routes/admin/content/$id.tsx'
git commit -m "feat: add admin story content workspace"
```

---

## Task 8: Public Story Hub And Detail Pages

**Files:**

- Create: `src/components/site/stories/storyPublicLogic.ts`
- Create: `src/components/site/stories/storyPublicLogic.test.ts`
- Create: `src/components/site/stories/StoryWall.tsx`
- Create: `src/components/site/stories/RescueMap.tsx`
- Create: `src/components/site/stories/StoryContentGrid.tsx`
- Create: `src/components/site/stories/StoryDetail.tsx`
- Create: `src/components/site/stories/StoryWall.test.tsx`
- Create: `src/routes/stories.tsx`
- Create: `src/routes/stories/$slug.tsx`
- Modify: `src/components/site/Header.tsx`

- [ ] **Step 1: Write failing public logic tests**

Create `src/components/site/stories/storyPublicLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { filterStoryCards, publicStatusLabel } from "./storyPublicLogic";

const stories = [
  {
    id: "a",
    type: "rescue_story",
    storyProfile: { animalType: "cat", publicStatus: "medical_care", rescueRegion: "灣仔" },
  },
  {
    id: "b",
    type: "rescue_story",
    storyProfile: { animalType: "dog", publicStatus: "adopted", rescueRegion: "深水埗" },
  },
  {
    id: "c",
    type: "event",
    storyProfile: null,
  },
] as const;

describe("story public logic", () => {
  test("filters story cards by animal type, status, and region", () => {
    expect(filterStoryCards(stories, { animalType: "cat" }).map((story) => story.id)).toEqual(["a"]);
    expect(filterStoryCards(stories, { publicStatus: "adopted" }).map((story) => story.id)).toEqual(["b"]);
    expect(filterStoryCards(stories, { rescueRegion: "灣仔" }).map((story) => story.id)).toEqual(["a"]);
  });

  test("labels public rescue statuses in Chinese", () => {
    expect(publicStatusLabel("medical_care")).toBe("醫療照護");
    expect(publicStatusLabel("ready_for_adoption")).toBe("準備領養");
  });
});
```

- [ ] **Step 2: Run public logic tests and verify they fail**

Run:

```bash
bun test src/components/site/stories/storyPublicLogic.test.ts
```

Expected: FAIL because the public story logic file does not exist.

- [ ] **Step 3: Implement public logic**

Create `src/components/site/stories/storyPublicLogic.ts`:

```ts
import type { AnimalStoryType, ContentSummary, RescuePublicStatus } from "../../../lib/content/types";

type StoryFilters = {
  animalType?: AnimalStoryType | "all";
  publicStatus?: RescuePublicStatus | "all";
  rescueRegion?: string;
};

export function publicStatusLabel(status: RescuePublicStatus) {
  const labels: Record<RescuePublicStatus, string> = {
    rescued: "已救援",
    medical_care: "醫療照護",
    foster_recovery: "暫托康復",
    ready_for_adoption: "準備領養",
    adopted: "已領養",
    sponsor_needed: "需要助養",
    closed: "已結案",
  };
  return labels[status];
}

export function filterStoryCards<T extends Pick<ContentSummary, "type" | "storyProfile">>(
  stories: readonly T[],
  filters: StoryFilters,
) {
  return stories.filter((story) => {
    if (story.type !== "rescue_story" || !story.storyProfile) return false;
    if (filters.animalType && filters.animalType !== "all" && story.storyProfile.animalType !== filters.animalType) return false;
    if (filters.publicStatus && filters.publicStatus !== "all" && story.storyProfile.publicStatus !== filters.publicStatus) return false;
    if (filters.rescueRegion && story.storyProfile.rescueRegion !== filters.rescueRegion) return false;
    return true;
  });
}
```

- [ ] **Step 4: Add public component smoke test**

Create `src/components/site/stories/StoryWall.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryWall } from "./StoryWall";

describe("StoryWall", () => {
  test("renders rescue story cards with status and region", () => {
    const markup = renderToStaticMarkup(
      <StoryWall
        stories={[
          {
            id: "content-1",
            slug: "siu-bak",
            type: "rescue_story",
            title: "小白康復中",
            subtitle: null,
            summary: "小白正在康復。",
            coverMediaId: null,
            coverImageUrl: null,
            status: "published",
            publishedAt: "2026-07-05T10:00:00.000Z",
            ctaLabel: "了解更多",
            ctaUrl: "/stories/siu-bak",
            storyProfile: {
              contentItemId: "content-1",
              animalType: "cat",
              publicStatus: "medical_care",
              rescueRegion: "灣仔",
              rescueDate: "2026-07-01",
              showOnMap: true,
              publicMapLabel: "灣仔區救援",
              publicLat: 22.277,
              publicLng: 114.173,
              internalAddress: null,
              internalLocationNotes: null,
              isFeatured: true,
            },
            latestPublicUpdate: null,
            createdAt: "2026-07-05T09:00:00.000Z",
            updatedAt: "2026-07-05T09:00:00.000Z",
          },
        ]}
      />,
    );

    expect(markup).toContain("救援故事牆");
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("灣仔");
  });
});
```

- [ ] **Step 5: Implement public components**

Implement:

- `StoryWall.tsx`: card grid, filters, status labels, image placeholder using `Cat` or `Dog` lucide icons, and links to `/stories/$slug`.
- `RescueMap.tsx`: SVG or CSS-based district-level map/list hybrid for V1; display public map label, region, status, and no exact address.
- `StoryContentGrid.tsx`: event, charity market, and report cards after the Story Wall and map.
- `StoryDetail.tsx`: cover, gallery, body, public update timeline, public rescue region, and CTA.

Use CSS variables and existing tokens. Do not hardcode brand colors in components.

- [ ] **Step 6: Add public routes**

Create `src/routes/stories.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RescueMap } from "../components/site/stories/RescueMap";
import { StoryContentGrid } from "../components/site/stories/StoryContentGrid";
import { StoryWall } from "../components/site/stories/StoryWall";
import type { ContentSummary, PublicStoryMapPoint } from "../lib/content/types";

export const Route = createFileRoute("/stories")({
  component: StoriesPage,
});

function StoriesPage() {
  const [stories, setStories] = useState<ContentSummary[]>([]);
  const [points, setPoints] = useState<PublicStoryMapPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/stories").then(async (response) => {
        if (!response.ok) throw new Error("Could not load stories");
        return (await response.json()) as { items: ContentSummary[]; total: number };
      }),
      fetch("/api/stories/map").then(async (response) => {
        if (!response.ok) throw new Error("Could not load story map");
        return (await response.json()) as { points: PublicStoryMapPoint[] };
      }),
    ])
      .then(([storyBody, mapBody]) => {
        setStories(storyBody.items);
        setPoints(mapBody.points);
      })
      .catch(() => setLoadError("暫時未能載入救援故事，請稍後再試。"));
  }, []);

  return (
    <main>
      <section className="px-6 py-12 lg:py-16 bg-[var(--color-bg)]">
        <div className="container-wide">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
            故事及宣傳中心
          </p>
          <h1 className="font-display text-4xl lg:text-6xl font-bold text-[var(--color-panel)]">
            最新救援與活動
          </h1>
          <p className="mt-4 max-w-[60ch] text-[var(--color-text-muted)]">
            跟進每個救援故事、前線更新、慈善市集、活動和協會報導。
          </p>
        </div>
      </section>
      {loadError ? (
        <div className="container-wide px-6 py-10 text-[var(--color-text-muted)]">{loadError}</div>
      ) : null}
      <StoryWall stories={stories} />
      <RescueMap points={points} />
      <StoryContentGrid items={stories} />
    </main>
  );
}
```

Create `src/routes/stories/$slug.tsx` with a component that fetches `/api/stories/${params.slug}` in `useEffect`, stores the result in state, shows a quiet loading/error state, and renders `StoryDetail`.

Modify `src/components/site/Header.tsx` to add a `故事` or `Stories` link to `/stories` in desktop and mobile navigation.

- [ ] **Step 7: Run public UI tests and build**

Run:

```bash
bun test src/components/site/stories/storyPublicLogic.test.ts src/components/site/stories/StoryWall.test.tsx
bun run build
```

Expected: tests PASS and build PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/site/stories src/routes/stories.tsx 'src/routes/stories/$slug.tsx' src/components/site/Header.tsx
git commit -m "feat: add public story hub"
```

---

## Task 9: End-To-End Verification And Polish

**Files:**

- Modify files from earlier tasks only when verification finds concrete issues.

- [ ] **Step 1: Run all unit tests**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Start or reuse the dev server**

Run:

```bash
bun run dev --host 127.0.0.1 --port 8080
```

Expected: dev server serves the app at `http://127.0.0.1:8080`.

- [ ] **Step 5: Manual browser verification**

Open:

```text
http://127.0.0.1:8080/stories
http://127.0.0.1:8080/admin/content
```

Verify:

- Public `/stories` shows Story Wall first, rescue map second, and promotion cards after.
- Public map labels show region-level locations only.
- Public story detail pages do not display internal address or internal notes.
- Staff/admin users can see `宣傳內容`.
- Treasurer users cannot see or access `宣傳內容`.
- Admin editor can save draft content, show publish validation, generate social copy, and show adopter notification drafts.

- [ ] **Step 6: Commit verification fixes**

If verification required fixes, commit them:

```bash
git add src supabase
git commit -m "fix: polish story promotion center"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: only intentionally untracked local files remain, such as `AGENTS.md`.
