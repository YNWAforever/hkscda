# Story & Promotion Center — WS1 Admin Authoring Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Story & Promotion Center usable end to end for staff: create content from the admin UI, filter the list by publish date/map/update/draft state, pick linked records by search, and edit social copy.

**Architecture:** Keep the existing layered content domain (route → `-handlers.ts` → `lib/content/http.server.ts` → service → `repository.server.ts`). Add one new admin endpoint (`link-search`) and extend the existing admin-summaries SQL read for the new filters. New admin UI reuses the established `fetchAdminJson`/`useMutation`/`Field` patterns.

**Tech Stack:** TypeScript (strict), Zod, React 19, TanStack Router/Query, Supabase Postgres RPCs, `bun:test`.

## Global Constraints

- Hand-written code has zero `any`.
- Every admin API route calls `requireAdmin(request, ["staff", "admin"], client)`; treasurer denied.
- Admin responses are `no-store` (use `jsonResponse`); public search schema is untouched.
- New filters are applied **before pagination** inside the SQL read — never by loading then filtering in the app.
- Migrations: keep RLS and pinned `search_path`; app-called RPCs live in `public` and are granted to `service_role`; `supabaseMigrations.test.ts` must stay green.
- `src/routeTree.gen.ts` is generated — never edit it by hand; regenerate via the router tooling.
- Copy stays Traditional Chinese; use `var(--color-*)` tokens, never hardcoded colours.
- Conventional Commits; tests are `*.test.ts(x)` beside the source with injected fakes.

---

### Task 1: Content create page

**Files:**
- Create: `src/routes/admin/content/new.tsx`
- Create: `src/components/admin/content/ContentCreateForm.tsx`
- Modify: `src/components/admin/content/contentAdminLogic.ts` (add `suggestSlug`)
- Modify: `src/components/admin/content/ContentManagement.tsx` (add 建立內容 button; fix the `????` label at line 237)
- Test: `src/components/admin/content/contentAdminLogic.test.ts`

**Interfaces:**
- Consumes: `fetchAdminJson` (`src/lib/admin/http.ts`), `requireAdminPageAccess`, `contentInputSchema` fields, `POST /api/admin/content` (already implemented; returns `201 { id }`).
- Produces: `suggestSlug(title: string): string`; route `/admin/content/new`.

- [ ] **Step 1: Write the failing slug test**

Add to `src/components/admin/content/contentAdminLogic.test.ts`:

```ts
import { suggestSlug } from "./contentAdminLogic";

describe("suggestSlug", () => {
  test("kebab-cases an ASCII title", () => {
    expect(suggestSlug("Rescue Story: Milo's New Home!")).toBe("rescue-story-milo-s-new-home");
  });
  test("returns an empty string for a purely CJK title (staff must type a slug)", () => {
    expect(suggestSlug("米路的新家")).toBe("");
  });
  test("strips leading/trailing separators and caps length", () => {
    const slug = suggestSlug("  --Hello, World--  " + "x".repeat(220));
    expect(slug.startsWith("hello-world")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(180);
    expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/admin/content/contentAdminLogic.test.ts`
Expected: FAIL — `suggestSlug` is not exported.

- [ ] **Step 3: Implement `suggestSlug`**

Add to `src/components/admin/content/contentAdminLogic.ts`:

```ts
export function suggestSlug(title: string) {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}
```

- [ ] **Step 4: Create the create form**

Create `src/components/admin/content/ContentCreateForm.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { ContentType } from "../../../lib/content/types";
import { formatContentTypeLabel, suggestSlug } from "./contentAdminLogic";

const contentTypes: ContentType[] = ["rescue_story", "event", "charity_market", "report"];

export function ContentCreateForm() {
  const navigate = useNavigate();
  const [type, setType] = useState<ContentType>("rescue_story");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [optional, setOptional] = useState({
    ctaLabel: "",
    ctaUrl: "",
    seoTitle: "",
    seoDescription: "",
    ogTitle: "",
    ogDescription: "",
  });

  const create = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ id: string }>(`/api/admin/content`, {
        method: "POST",
        body: JSON.stringify({ type, title, slug, summary, body, status: "draft", ...optional }),
      }),
    onSuccess: (result) => {
      void navigate({ to: "/admin/content/$id", params: { id: result.id } });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">新增宣傳內容</h1>
      </div>
      <form
        className="max-w-2xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          類型
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ContentType)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            {contentTypes.map((option) => (
              <option key={option} value={option}>
                {formatContentTypeLabel(option, "zh")}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          標題
          <input
            required
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugTouched) setSlug(suggestSlug(event.target.value));
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          網址 slug（小寫英數字與連字號）
          <input
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          摘要
          <textarea
            required
            maxLength={320}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          正文（可稍後填寫）
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>

        {(["ctaLabel", "ctaUrl", "seoTitle", "seoDescription", "ogTitle", "ogDescription"] as const).map(
          (key) => (
            <label
              key={key}
              className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]"
            >
              {key}
              <input
                value={optional[key]}
                onChange={(event) =>
                  setOptional((current) => ({ ...current, [key]: event.target.value }))
                }
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
              />
            </label>
          ),
        )}

        {create.error ? (
          <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
            {create.error instanceof Error ? create.error.message : "建立失敗，請重試。"}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            {create.isPending ? "建立中" : "建立草稿"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create the route**

Create `src/routes/admin/content/new.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ContentCreateForm } from "../../../components/admin/content/ContentCreateForm";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/new")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminContentNewPage,
});

function AdminContentNewPage() {
  return (
    <AdminLayout activeSection="content">
      <ContentCreateForm />
    </AdminLayout>
  );
}
```

Regenerate the route tree with the router tooling (run `bun run build`, or briefly `bun run dev`) so `routeTree.gen.ts` gains `/admin/content/new`. Do not hand-edit it.

- [ ] **Step 6: Add the create button and fix the broken label**

In `src/components/admin/content/ContentManagement.tsx`:
- Replace the broken `????` label at line 237 with `領養需知`.
- Add a primary 建立內容 link as the first toolbar action:

```tsx
          <Link
            to="/admin/content/new"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)]"
          >
            建立內容
          </Link>
```

- [ ] **Step 7: Run tests and gates**

Run: `bun test src/components/admin/content/contentAdminLogic.test.ts`
Run: `bunx tsc --noEmit` and `bun run lint`
Expected: pass/clean.

- [ ] **Step 8: Commit**

```bash
git add src/routes/admin/content/new.tsx src/components/admin/content/ContentCreateForm.tsx src/components/admin/content/contentAdminLogic.ts src/components/admin/content/contentAdminLogic.test.ts src/components/admin/content/ContentManagement.tsx src/routeTree.gen.ts
git commit -m "feat(content): add admin content create page"
```

---

### Task 2: Admin list filters — schema, SQL read, repository

**Files:**
- Modify: `src/lib/content/schemas.ts` (add `adminContentSearchSchema`)
- Modify: `src/lib/content/service.ts` (`listAdminContent` uses the admin schema)
- Create: `supabase/migrations/<timestamp>_content_admin_filters.sql`
- Modify: `src/lib/content/repository.server.ts` (pass filters through — already passes `input` as `p_filters`)
- Test: `src/lib/content/schemas.test.ts`, `src/lib/content/service.test.ts`

**Interfaces:**
- Consumes: `notificationDraftStatuses` from `./types`.
- Produces: `adminContentSearchSchema` (extends `contentSearchSchema` with `publishedFrom`, `publishedTo`, `mapVisibility: "on"|"off"`, `hasUpdate: "yes"|"no"`, `draftState: NotificationDraftStatus`); the RPC `read_content_admin_summaries` honours them.

- [ ] **Step 1: Write the failing schema tests**

Add to `src/lib/content/schemas.test.ts`:

```ts
import { adminContentSearchSchema } from "./schemas";

describe("adminContentSearchSchema", () => {
  test("parses the new admin filters", () => {
    const parsed = adminContentSearchSchema.parse({
      publishedFrom: "2026-01-01",
      publishedTo: "2026-12-31",
      mapVisibility: "on",
      hasUpdate: "yes",
      draftState: "draft",
    });
    expect(parsed.mapVisibility).toBe("on");
    expect(parsed.hasUpdate).toBe("yes");
    expect(parsed.draftState).toBe("draft");
  });
  test("rejects unknown enum values", () => {
    expect(adminContentSearchSchema.safeParse({ mapVisibility: "maybe" }).success).toBe(false);
    expect(adminContentSearchSchema.safeParse({ draftState: "sent" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure, then add the schema**

Run: `bun test src/lib/content/schemas.test.ts`
Expected: FAIL — no export.

Add to `src/lib/content/schemas.ts` (after `contentSearchSchema`):

```ts
export const adminContentSearchSchema = contentSearchSchema.extend({
  publishedFrom: z.string().date().optional(),
  publishedTo: z.string().date().optional(),
  mapVisibility: z.enum(["on", "off"]).optional(),
  hasUpdate: z.enum(["yes", "no"]).optional(),
  draftState: z.enum(notificationDraftStatuses).optional(),
});

export type AdminContentSearch = z.infer<typeof adminContentSearchSchema>;
```

Import `notificationDraftStatuses` in the types import list at the top.

- [ ] **Step 3: Use the admin schema in the service**

In `src/lib/content/service.ts`, import `adminContentSearchSchema` and change:

```ts
    async listAdminContent(raw: unknown) {
      return repo.listAdminContent(adminContentSearchSchema.parse(raw));
    },
```

Update `ContentRepository.listAdminContent`'s parameter type from `ContentSearch` to `AdminContentSearch` and adjust the local type alias.

- [ ] **Step 4: Write the filters migration**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_content_admin_filters.sql` (use the current timestamp, later than `20260905163559`), re-creating `read_content_admin_summaries` with the extra predicates inside `filtered`, before `page`:

```sql
create or replace function public.read_content_admin_summaries(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with filtered as (
 select item.* from public.content_item item
 where (p_filters->>'type' is null or item.type=p_filters->>'type')
 and (p_filters->>'status' is null or item.status=p_filters->>'status')
 and (p_filters->>'q' is null or strpos(lower(item.title||' '||coalesce(item.summary,'')),lower(p_filters->>'q'))>0)
 and (p_filters->>'publishedFrom' is null or item.published_at >= (p_filters->>'publishedFrom')::date)
 and (p_filters->>'publishedTo' is null or item.published_at < ((p_filters->>'publishedTo')::date + interval '1 day'))
 and (p_filters->>'mapVisibility' is null or exists (select 1 from public.rescue_story_profile p where p.content_item_id=item.id and p.show_on_map = ((p_filters->>'mapVisibility')='on')))
 and (p_filters->>'hasUpdate' is null or (case when (p_filters->>'hasUpdate')='yes' then exists (select 1 from public.story_update u where u.content_item_id=item.id) else not exists (select 1 from public.story_update u where u.content_item_id=item.id) end))
 and (p_filters->>'draftState' is null or exists (select 1 from public.recipient_notification_draft d where d.content_item_id=item.id and d.status=p_filters->>'draftState'))
 and ((p_filters->>'animalType' is null and p_filters->>'publicStatus' is null and p_filters->>'rescueRegion' is null) or exists(select 1 from public.rescue_story_profile profile where profile.content_item_id=item.id
 and (p_filters->>'animalType' is null or profile.animal_type=p_filters->>'animalType')
 and (p_filters->>'publicStatus' is null or profile.public_status=p_filters->>'publicStatus')
 and (p_filters->>'rescueRegion' is null or profile.rescue_region=p_filters->>'rescueRegion')))
 ), page as (
 select item.* from filtered item order by item.updated_at desc,item.id
 limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 offset (greatest(1,coalesce((p_filters->>'page')::int,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 ), snapshots as (
 select item.id,item.updated_at,jsonb_build_object(
 'content',to_jsonb(item)-'body'-'seo_title'-'seo_description'-'og_title'-'og_description',
 'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=item.id),
 'updates',case when latest.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(latest)-'body') end,
 'media',case when cover.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(cover)) end
 ) as snapshot
 from page item
 left join lateral (select u.* from public.story_update u where u.content_item_id=item.id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1) latest on true
 left join lateral (select m.* from public.content_media m where m.content_item_id=item.id
 and (m.story_update_id is null or exists (select 1 from public.story_update u where u.id=m.story_update_id and u.content_item_id=item.id and u.is_authoring_active and u.visibility='public'))
 and (m.id=item.cover_media_id or m.is_cover)
 order by (m.id=item.cover_media_id) desc nulls last,m.sort_order,m.created_at,m.id limit 1) cover on true
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(snapshot order by updated_at desc,id) from snapshots),'[]'::jsonb))
$$;
revoke all on function public.read_content_admin_summaries(jsonb) from public,anon,authenticated;
grant execute on function public.read_content_admin_summaries(jsonb) to service_role;
```

- [ ] **Step 5: Run tests and gates**

Run: `bun test src/lib/content/schemas.test.ts src/lib/content/service.test.ts src/lib/content/migrationPolicy.test.ts`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean; the migration policy test accepts the new file (RLS/search_path rules).

- [ ] **Step 6: Commit**

```bash
git add src/lib/content/schemas.ts src/lib/content/schemas.test.ts src/lib/content/service.ts src/lib/content/service.test.ts supabase/migrations
git commit -m "feat(content): support admin content list filters"
```

---

### Task 3: Admin list filters — UI

**Files:**
- Modify: `src/components/admin/content/contentAdminLogic.ts` (`ContentSearchInput` + `buildContentSearchParams`)
- Modify: `src/components/admin/content/ContentManagement.tsx`
- Test: `src/components/admin/content/contentAdminLogic.test.ts`

**Interfaces:**
- Consumes: the schema from Task 2.
- Produces: `buildContentSearchParams` emits `publishedFrom`, `publishedTo`, `mapVisibility`, `hasUpdate`, `draftState` when set.

- [ ] **Step 1: Write the failing test**

Add to `contentAdminLogic.test.ts`:

```ts
test("buildContentSearchParams serializes the new admin filters", () => {
  const params = buildContentSearchParams({
    publishedFrom: "2026-01-01",
    publishedTo: "2026-06-30",
    mapVisibility: "on",
    hasUpdate: "no",
    draftState: "dismissed",
  });
  expect(params.get("publishedFrom")).toBe("2026-01-01");
  expect(params.get("publishedTo")).toBe("2026-06-30");
  expect(params.get("mapVisibility")).toBe("on");
  expect(params.get("hasUpdate")).toBe("no");
  expect(params.get("draftState")).toBe("dismissed");
});
```

- [ ] **Step 2: Run to verify failure, then extend the logic**

Run: `bun test src/components/admin/content/contentAdminLogic.test.ts`
Expected: FAIL.

Extend `ContentSearchInput` with `publishedFrom?: string; publishedTo?: string; mapVisibility?: "on" | "off" | "all"; hasUpdate?: "yes" | "no" | "all"; draftState?: NotificationDraftStatus | "all";` and in `buildContentSearchParams` append each non-empty/non-`all` value:

```ts
  const publishedFrom = input.publishedFrom?.trim();
  const publishedTo = input.publishedTo?.trim();
  if (publishedFrom) params.set("publishedFrom", publishedFrom);
  if (publishedTo) params.set("publishedTo", publishedTo);
  if (input.mapVisibility && input.mapVisibility !== "all")
    params.set("mapVisibility", input.mapVisibility);
  if (input.hasUpdate && input.hasUpdate !== "all") params.set("hasUpdate", input.hasUpdate);
  if (input.draftState && input.draftState !== "all")
    params.set("draftState", input.draftState);
```

Import `NotificationDraftStatus` from `../../../lib/content/types`.

- [ ] **Step 3: Add the UI controls**

In `ContentManagement.tsx`'s `ContentManagementRuntime`, add state for the four filters (calling `withPageReset`), include them in the `buildContentSearchParams` memo + dependency array, and pass them into `ContentManagementView`. Extend the `ContentManagementViewProps` and the filter grid (currently `md:grid-cols-[1.4fr_1fr_1fr_1fr]`) with:

```tsx
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            發布日期（起）
            <input type="date" value={publishedFrom} onChange={(e) => onPublishedFromChange?.(e.target.value)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            發布日期（迄）
            <input type="date" value={publishedTo} onChange={(e) => onPublishedToChange?.(e.target.value)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            地圖顯示
            <select value={mapVisibility} onChange={(e) => onMapVisibilityChange?.(e.target.value as "all" | "on" | "off")} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal">
              <option value="all">全部</option>
              <option value="on">顯示</option>
              <option value="off">不顯示</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            更新記錄
            <select value={hasUpdate} onChange={(e) => onHasUpdateChange?.(e.target.value as "all" | "yes" | "no")} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal">
              <option value="all">全部</option>
              <option value="yes">有更新</option>
              <option value="no">沒有更新</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            通知草稿
            <select value={draftState} onChange={(e) => onDraftStateChange?.(e.target.value as "all" | NotificationDraftStatus)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal">
              <option value="all">全部</option>
              <option value="draft">草稿</option>
              <option value="copied">已複製</option>
              <option value="sent_manually">已手動發送</option>
              <option value="dismissed">已略過</option>
            </select>
          </label>
        </div>
```

- [ ] **Step 4: Run tests and gates**

Run: `bun test src/components/admin/content/contentAdminLogic.test.ts`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/contentAdminLogic.ts src/components/admin/content/contentAdminLogic.test.ts src/components/admin/content/ContentManagement.tsx
git commit -m "feat(content): add publish-date, map, update and draft list filters"
```

---

### Task 4: Linked-record search endpoint

**Files:**
- Modify: `src/lib/content/schemas.ts` (add `linkSearchSchema`, `linkSearchTypes`)
- Modify: `src/lib/content/service.ts` (`searchLinks`, add `searchLinks` to `ContentRepository`)
- Modify: `src/lib/content/repository.server.ts` (per-type bounded queries)
- Modify: `src/lib/content/http.server.ts` (`searchLinks` handler)
- Modify: `src/routes/api/admin/content/-handlers.ts` (no change needed) and create `src/routes/api/admin/content/link-search.ts`
- Test: `src/lib/content/schemas.test.ts`, `src/lib/content/service.test.ts`

**Interfaces:**
- Consumes: the five `contentLinkTypes`.
- Produces: `searchLinks(input: { linkedType: ContentLinkType; q: string; limit?: number }): Promise<Array<{ id: string; label: string; sublabel: string | null }>>`; `GET /api/admin/content/link-search?linkedType=&q=` returns `{ results }`.

- [ ] **Step 1: Write the failing schema/service tests**

Add to `schemas.test.ts`:

```ts
import { linkSearchSchema } from "./schemas";

describe("linkSearchSchema", () => {
  test("trims q, defaults limit, and rejects unknown types", () => {
    expect(linkSearchSchema.parse({ linkedType: "animal", q: "  mi  " }).q).toBe("mi");
    expect(linkSearchSchema.parse({ linkedType: "animal", q: "x" }).limit).toBe(20);
    expect(linkSearchSchema.safeParse({ linkedType: "nope", q: "x" }).success).toBe(false);
  });
});
```

Add to `service.test.ts`:

```ts
test("searchLinks delegates to the repository with a bounded limit", async () => {
  const searchLinks = mock(async () => [{ id: "a1", label: "Milo", sublabel: null }]);
  const { service } = buildService({ searchLinks });
  const result = await service.searchLinks({ linkedType: "animal", q: "mi", limit: 5 });
  expect(searchLinks).toHaveBeenCalledWith({ linkedType: "animal", q: "mi", limit: 5 });
  expect(result).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify failure, then add the schema**

Run: `bun test src/lib/content/schemas.test.ts src/lib/content/service.test.ts`
Expected: FAIL.

Add to `schemas.ts`:

```ts
export const linkSearchSchema = z.object({
  linkedType: z.enum(contentLinkTypes),
  q: trimmed.min(1).max(100),
  limit: numberFromInput(z.number().int().min(1)).catch(20).transform((v) => Math.min(v, 20)),
});

export type LinkSearch = z.infer<typeof linkSearchSchema>;
```

Add `contentLinkTypes` to the types import.

- [ ] **Step 3: Add the service + repository method**

In `service.ts`: extend `ContentRepository` with

```ts
  searchLinks(input: LinkSearch): Promise<Array<{ id: string; label: string; sublabel: string | null }>>;
```

and add to the returned object:

```ts
    async searchLinks(raw: unknown) {
      const parsed = linkSearchSchema.parse(raw);
      return repo.searchLinks(parsed);
    },
```

In `repository.server.ts`, implement bounded per-type selects (≤ the requested limit, `.ilike` on the label column), returning `{ id, label, sublabel }`:

- `animal` → `animals` select `id, name, name_en, type`; label `name` (fallback `name_en`), sublabel `type`.
- `adoption_case` → `adoption_case` select `id, applicant_name, applicant_email`; label `applicant_name`, sublabel a masked email (e.g. first char + `***@domain`).
- `successful_adoption` → `successful_adoption` select `id, case_number, animal_id`; label `case_number`, sublabel `animal_id`.
- `supporter` → `supporter` select `id, name, phone`; label `name`, sublabel a masked phone (last 4 digits only).
- `volunteer_activity` → `volunteer_activity` select `id, title, starts_at`; label `title`, sublabel the ISO date.

Use `.order(label).limit(limit)` and `.or(...)` / `.ilike(...)` for the query. Do not return emails, phones, addresses, or notes in full.

- [ ] **Step 4: Add the handler + route**

In `http.server.ts`, add to the returned handlers object:

```ts
    searchLinks({ request }: HandlerContext) {
      return withContentErrors(async () => {
        await requireContentAdmin(request);
        return jsonResponse({ results: await service.searchLinks(searchParams(request)) });
      });
    },
```

Create `src/routes/api/admin/content/link-search.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/content/link-search")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().searchLinks({ request }),
    },
  },
});
```

Then regenerate `src/routeTree.gen.ts` via the router tooling.

- [ ] **Step 5: Run tests and gates**

Run: `bun test src/lib/content/schemas.test.ts src/lib/content/service.test.ts`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/content/schemas.ts src/lib/content/schemas.test.ts src/lib/content/service.ts src/lib/content/service.test.ts src/lib/content/repository.server.ts src/lib/content/http.server.ts src/routes/api/admin/content/link-search.ts
git commit -m "feat(content): add admin linked-record search endpoint"
```

---

### Task 5: Linked-record picker in the editor

**Files:**
- Create: `src/components/admin/content/LinkedRecordPicker.tsx`
- Modify: `src/components/admin/content/ContentEditor.tsx` (`LinkedRecords`)
- Test: `src/components/admin/content/LinkedRecordPicker.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/content/link-search`, `fetchAdminJson`, `ContentLinkType`.
- Produces: `LinkedRecordPicker({ linkedType, value, onChange, disabled })` — a debounced search that calls `onChange({ id, label })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/content/LinkedRecordPicker.test.tsx` (mirror the repo's no-DOM harness style used in `ContentEditor.test.tsx` — test a pure `mergeLinkResults`/`toPick` helper exported from the component module rather than clicks):

```tsx
import { describe, expect, test } from "bun:test";
import { toLinkOption } from "./LinkedRecordPicker";

describe("toLinkOption", () => {
  test("maps a search result to a pickable option", () => {
    expect(toLinkOption({ id: "a1", label: "Milo", sublabel: "cat" })).toEqual({
      id: "a1",
      label: "Milo",
      sublabel: "cat",
    });
  });
  test("falls back to an empty sublabel", () => {
    expect(toLinkOption({ id: "a1", label: "Milo", sublabel: null }).sublabel).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the picker**

Run: `bun test src/components/admin/content/LinkedRecordPicker.test.tsx`
Expected: FAIL.

Create `LinkedRecordPicker.tsx` exporting `toLinkOption`, a `useLinkSearch(linkedType, query)` hook (`useQuery`, `enabled: query.trim().length > 0`, key `["content-link-search", linkedType, query]` calling `/api/admin/content/link-search?linkedType=…&q=…`), and a `LinkedRecordPicker` that renders the debounced input + a results list; selecting a result calls `onChange({ id, label })` and shows the chosen label.

- [ ] **Step 3: Integrate into `LinkedRecords`**

In `ContentEditor.tsx` `LinkedRecords`, state: `linkedId` stays but is set by the picker; add `linkedLabel`. Replace the 紀錄 ID `<input>` with:

```tsx
        <Field label="關聯紀錄">
          <LinkedRecordPicker
            linkedType={form.linkedType}
            value={form.linkedId}
            label={linkedLabel}
            disabled={pending}
            onChange={(pick) => {
              setForm((current) => ({ ...current, linkedId: pick.id }));
              setLinkedLabel(pick.label);
            }}
          />
        </Field>
```

Keep the existing 類型 and 關係 selects and the submit that calls `onCreate(form)`. Disable submit while `linkedId` is empty. Import `LinkedRecordPicker`.

- [ ] **Step 4: Run tests and gates**

Run: `bun test src/components/admin/content/LinkedRecordPicker.test.tsx src/components/admin/content/ContentEditor.test.tsx`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/LinkedRecordPicker.tsx src/components/admin/content/LinkedRecordPicker.test.tsx src/components/admin/content/ContentEditor.tsx
git commit -m "feat(content): pick linked records by search in the editor"
```

---

### Task 6: Editable social copy

**Files:**
- Modify: `src/lib/content/schemas.ts` (`socialCopyUpdateSchema`)
- Modify: `src/lib/content/service.ts` (`updateSocialCopy` persists text/hashtags)
- Modify: `src/lib/content/repository.server.ts` (`updateSocialCopy`)
- Modify: `src/lib/content/http.server.ts` (pass the richer input)
- Modify: `src/components/admin/content/SocialCopyPanel.tsx` (editable fields + save)
- Modify: `src/components/admin/content/ContentEditor.tsx` (wire the save mutation)
- Test: `src/lib/content/schemas.test.ts`, `src/lib/content/service.test.ts`

**Interfaces:**
- Consumes: `socialCopyStatuses`.
- Produces: `socialCopyUpdateSchema = { status?, copyText?, hashtags? }`; `PATCH /api/admin/content/social-copy/$id` accepts any subset.

- [ ] **Step 1: Write the failing tests**

Add to `schemas.test.ts`:

```ts
import { socialCopyUpdateSchema } from "./schemas";

describe("socialCopyUpdateSchema", () => {
  test("accepts a status-only update (backwards compatible)", () => {
    expect(socialCopyUpdateSchema.parse({ status: "copied" })).toEqual({ status: "copied" });
  });
  test("accepts edited text and hashtags", () => {
    const parsed = socialCopyUpdateSchema.parse({ copyText: "新文案", hashtags: ["領養", "香港"] });
    expect(parsed.copyText).toBe("新文案");
    expect(parsed.hashtags).toEqual(["領養", "香港"]);
  });
  test("rejects an empty update", () => {
    expect(socialCopyUpdateSchema.safeParse({}).success).toBe(false);
  });
});
```

Add to `service.test.ts`:

```ts
test("updateSocialCopy persists edited text and hashtags", async () => {
  const updateSocialCopy = mock(async () => {});
  const { service } = buildService({ updateSocialCopy });
  await service.updateSocialCopy({
    actorUserId: "u1",
    copyId: "copy-1",
    input: { copyText: "新文案", hashtags: ["領養"] },
  });
  expect(updateSocialCopy).toHaveBeenCalledWith("copy-1", { copyText: "新文案", hashtags: ["領養"] });
});
```

- [ ] **Step 2: Run to verify failure, then add the schema**

Run: `bun test src/lib/content/schemas.test.ts src/lib/content/service.test.ts`
Expected: FAIL.

In `schemas.ts`:

```ts
export const socialCopyUpdateSchema = z
  .object({
    status: z.enum(socialCopyStatuses).optional(),
    copyText: trimmed.min(1).max(10000).optional(),
    hashtags: z.array(trimmed.min(1).max(60)).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a status, copyText, or hashtags",
  });
```

Keep `socialCopyStatusSchema` for any existing callers.

- [ ] **Step 3: Persist via service + repository**

In `service.ts`, add a method `updateSocialCopy({ actorUserId, copyId, input })` that parses `socialCopyUpdateSchema`, calls `repo.updateSocialCopy(copyId, parsed)`, audits `action: "content.social_copy.update"`, and returns `{ ok: true }`. Add `updateSocialCopy(id, patch): Promise<void>` to `ContentRepository`.

In `repository.server.ts`, implement it: if `patch.status` and/or `patch.copyText`/`patch.hashtags` are present, update the corresponding snake_case columns on `social_copy_variant` by id.

In `http.server.ts`, change `updateSocialCopyStatus` to call `service.updateSocialCopy` (keep the route and method name) so the PATCH accepts the richer body.

- [ ] **Step 4: Make the panel editable**

In `SocialCopyPanel.tsx`, add props `onSave?: (copyId: string, patch: { copyText: string; hashtags: string[] }) => void` and `savingCopyId?: string | null`. Replace the read-only `<p>{copy.copyText}</p>` with a `<textarea>` bound to a local draft (initialised from `copy`), a hashtags `<input>` (space-separated, parsed to an array on save), and a 儲存 button that calls `onSave`. Show the button disabled unless the draft differs from `copy`. Keep the existing 複製/封存 actions.

- [ ] **Step 5: Wire the save mutation**

In `ContentEditor.tsx`, add a mutation that PATCHes `/api/admin/content/social-copy/${copyId}` with `{ copyText, hashtags }`, invalidating `["admin-content-detail", contentId]`; pass `onSave`/`savingCopyId` to `SocialCopyPanel` and include the error in `ActionErrors`.

- [ ] **Step 6: Run tests and gates**

Run: `bun test src/lib/content/schemas.test.ts src/lib/content/service.test.ts src/components/admin/content/ContentEditor.test.tsx`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/content/schemas.ts src/lib/content/schemas.test.ts src/lib/content/service.ts src/lib/content/service.test.ts src/lib/content/repository.server.ts src/lib/content/http.server.ts src/components/admin/content/SocialCopyPanel.tsx src/components/admin/content/ContentEditor.tsx
git commit -m "feat(content): allow editing social copy variants"
```

---

## Self-Review

**Spec coverage (WS1):**
- Create flow (`/admin/content/new`, form, toolbar button, slug suggestion) → Task 1.
- Four list filters with bounded server-side semantics → Tasks 2 (schema/SQL) and 3 (UI).
- Linked-record search endpoint + picker → Tasks 4 and 5.
- Editable social copy → Task 6.

**Placeholder scan:** every code step contains real code or a precise, testable instruction; the migration and endpoint follow the existing patterns with concrete column names verified against the migrations.

**Type consistency:** `adminContentSearchSchema`/`AdminContentSearch` (Task 2) is consumed by the UI params (Task 3); `searchLinks`/`LinkSearch` (Task 4) matches the picker's call (Task 5); `updateSocialCopy` (Task 6) is used by both the handler and the panel.

## Notes for the implementer

- Regenerate `src/routeTree.gen.ts` via the router tooling after adding the route; never hand-edit it.
- The `ContentManagement.tsx` toolbar currently renders a literal `????` for the 領養需知 link — fix it while adding the create button.
- Extend existing test harnesses/fakes in `schemas.test.ts`, `service.test.ts`, and `ContentEditor.test.tsx` rather than inventing new ones.
- Do not touch the public `/api/stories` cache header or any WS2 code.
