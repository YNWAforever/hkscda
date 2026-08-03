# Content List Read Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace serial per-content list hydration with a deep bulk-read module whose query count stays fixed while preserving every admin, public, and story-map response.

**Architecture:** Add `contentListRead.server.ts` as a Supabase-backed read module implementing the three existing content list methods. It queries the ordered content page once, batch-loads profiles, media, and public updates with `.in(...)`, assembles the existing output types in memory, and leaves single-content hydration and all authoring mutations in `repository.server.ts`.

**Tech Stack:** TypeScript 5.8, Bun test, Supabase JavaScript 2.108, PostgREST filters, TanStack Start, Zod 3.

## Global Constraints

- Preserve all existing API routes, response shapes, `ContentSummary`, `PublicStoryMapPoint`, filters, ordering, pagination, and cache behavior.
- Preserve admin profile visibility, public profile redaction, unsafe-CTA rejection, cover-image resolution, latest-public-update selection, update media, and invalid map-point filtering.
- Keep `hydrateContentDetail`, single-content reads, content mutations, publishing, and authoring unchanged.
- Do not add migrations, views, functions, indexes, dependencies, timing benchmarks, or client changes.
- Use exact, page-scoped `.in("content_item_id", contentIds)` filters; the Supabase JavaScript reference supports array values for `.in(...)`: https://supabase.com/docs/reference/javascript/using-filters-in
- Keep the existing offset/range pagination contract. Cursor pagination is a separate future change because it would alter the API and client behavior approved as out of scope.
- A non-empty unfiltered page must use exactly four database reads; a non-empty story-filtered page must use exactly five. Query count must not grow with page size.
- Any database read error rejects the whole list. Missing related rows remain valid `null` values.

---

## File Structure

- Create `src/lib/content/contentListRead.server.ts`: owns content list filtering, page queries, three relation batch queries, in-memory lookup maps, summary projection, public redaction, and map projection.
- Create `src/lib/content/contentListRead.server.test.ts`: owns the fake Supabase query tracer, query-count contracts, parity fixtures, empty-page behavior, and error propagation tests.
- Modify `src/lib/content/repository.server.ts`: constructs the new module, delegates exactly three list methods, and deletes list-only serial hydration/filter helpers after integration.
- Keep `src/lib/content/repositoryMapping.test.ts`: existing detail mapping and public-detail regression coverage remains unchanged.

The new module intentionally defines list-specific row types and projections. It does not import mapping functions from `repository.server.ts`, which would create a circular dependency, and it does not move detail-only mapping code into a broader refactor.

---

### Task 1: Bulk Admin Content List Reader

**Files:**
- Create: `src/lib/content/contentListRead.server.ts`
- Create: `src/lib/content/contentListRead.server.test.ts`

**Interfaces:**
- Consumes: `ContentSearch`, `ContentSummary`, `ContentRepository["listAdminContent"]`, `SupabaseClient`.
- Produces: `createSupabaseContentListRead(client)` with `listAdminContent(input: ContentSearch): Promise<{ items: ContentSummary[]; total: number }>`; later tasks extend the same returned module with public methods.

- [ ] **Step 1: Write the failing admin query-count and output test**

Create the test tracer and an admin fixture. The fake query builder must record when a query is awaited, because creating a Supabase builder alone is not a database read.

```ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseContentListRead } from "./contentListRead.server";

type FakeResponse = {
  data: unknown[] | null;
  error: Error | null;
  count?: number | null;
};

type QueryTrace = {
  table: string;
  select: string;
  count: string | null;
  filters: Array<{ method: "eq" | "in" | "or"; column: string; value: unknown }>;
  orders: Array<{ column: string; options: unknown }>;
  range: [number, number] | null;
};

class FakeQueryBuilder {
  private readonly trace: QueryTrace;

  constructor(
    table: string,
    private readonly responses: Map<string, FakeResponse[]>,
    private readonly calls: QueryTrace[],
  ) {
    this.trace = {
      table,
      select: "",
      count: null,
      filters: [],
      orders: [],
      range: null,
    };
  }

  select(columns: string, options?: { count?: string }) {
    this.trace.select = columns;
    this.trace.count = options?.count ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.trace.filters.push({ method: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.trace.filters.push({ method: "in", column, value });
    return this;
  }

  or(value: string) {
    this.trace.filters.push({ method: "or", column: "or", value });
    return this;
  }

  order(column: string, options: unknown) {
    this.trace.orders.push({ column, options });
    return this;
  }

  range(from: number, to: number) {
    this.trace.range = [from, to];
    return this;
  }

  then(resolve: (value: FakeResponse) => unknown, reject: (reason: unknown) => unknown) {
    this.calls.push(structuredClone(this.trace));
    const queue = this.responses.get(this.trace.table) ?? [];
    const response = queue.shift() ?? { data: [], error: null, count: null };
    return Promise.resolve(response).then(resolve, reject);
  }
}

function contentRow(id: string) {
  return {
    id,
    slug: `story-${id}`,
    type: "rescue_story",
    title: `Story ${id}`,
    subtitle: null,
    summary: `Summary ${id}`,
    cover_media_id: `media-${id}`,
    status: "published",
    published_at: "2026-07-01T00:00:00.000Z",
    cta_label: "Read",
    cta_url: `/stories/story-${id}`,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function profileRow(id: string) {
  return {
    content_item_id: id,
    animal_type: "cat",
    public_status: "recovering",
    rescue_region: "Kowloon",
    rescue_date: "2026-05-01",
    show_on_map: true,
    public_map_label: `Map ${id}`,
    public_lat: 22.3193,
    public_lng: 114.1694,
    internal_address: `Internal ${id}`,
    internal_location_notes: `Notes ${id}`,
    is_featured: false,
  };
}

function mediaRow(id: string) {
  return {
    id: `media-${id}`,
    content_item_id: id,
    story_update_id: null,
    storage_bucket: "content",
    storage_path: `stories/${id}.jpg`,
    alt_text: `Story ${id}`,
    caption: null,
    sort_order: 0,
    is_cover: true,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

function updateRow(id: string) {
  return {
    id: `update-${id}`,
    content_item_id: id,
    kind: "medical",
    title: `Update ${id}`,
    body: null,
    occurred_at: "2026-07-02T00:00:00.000Z",
    visibility: "public",
    should_generate_adopter_drafts: false,
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
  };
}

type FakeClientOverrides = Partial<Record<
  "content_item" | "rescue_story_profile" | "content_media" | "story_update",
  FakeResponse[]
>>;

function createFakeClient(
  rows: ReturnType<typeof contentRow>[],
  overrides: FakeClientOverrides = {},
) {
  const calls: QueryTrace[] = [];
  const ids = rows.map((row) => row.id);
  const responses = new Map<string, FakeResponse[]>([
    ["content_item", [{ data: rows, error: null, count: rows.length }]],
    ["rescue_story_profile", [{ data: ids.map(profileRow), error: null }]],
    ["content_media", [{ data: ids.map(mediaRow), error: null }]],
    ["story_update", [{ data: ids.map(updateRow), error: null }]],
  ]);
  for (const [table, queue] of Object.entries(overrides)) {
    if (queue) responses.set(table, queue);
  }
  const client = {
    from(table: string) {
      return new FakeQueryBuilder(table, responses, calls);
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("createSupabaseContentListRead", () => {
  test("lists one or fifty admin summaries with exactly four reads", async () => {
    for (const size of [1, 50]) {
      const rows = Array.from({ length: size }, (_, index) => contentRow(String(index + 1)));
      const { client, calls } = createFakeClient(rows);
      const reader = createSupabaseContentListRead(client);

      const result = await reader.listAdminContent({ page: 1, pageSize: size });

      expect(result.total).toBe(size);
      expect(result.items).toHaveLength(size);
      expect(result.items[0]?.storyProfile?.internalAddress).toBe("Internal 1");
      expect(result.items[0]?.coverImageUrl).toBe(
        "https://cdn.test/content/stories/1.jpg",
      );
      expect(result.items[0]?.latestPublicUpdate?.title).toBe("Update 1");
      expect(calls.map((call) => call.table)).toEqual([
        "content_item",
        "rescue_story_profile",
        "content_media",
        "story_update",
      ]);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: FAIL because `./contentListRead.server` does not exist.

- [ ] **Step 3: Implement the minimal admin bulk reader**

Create `contentListRead.server.ts` with a list-specific read model. Use explicit select columns to avoid fetching detail-only body, SEO, links, social copy, and notification fields.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentSearch } from "./schemas";
import type { ContentRepository } from "./service";
import type {
  ContentMedia,
  ContentStatus,
  ContentSummary,
  ContentType,
  RescueStoryProfile,
  StoryUpdate,
  StoryUpdateKind,
} from "./types";

type ContentListRow = {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  subtitle: string | null;
  summary: string;
  cover_media_id: string | null;
  status: ContentStatus;
  published_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  content_item_id: string;
  animal_type: RescueStoryProfile["animalType"];
  public_status: RescueStoryProfile["publicStatus"];
  rescue_region: string;
  rescue_date: string | null;
  show_on_map: boolean;
  public_map_label: string | null;
  public_lat: number | string | null;
  public_lng: number | string | null;
  internal_address: string | null;
  internal_location_notes: string | null;
  is_featured: boolean;
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
  updated_at: string;
};

type PublicUpdateRow = {
  id: string;
  content_item_id: string;
  kind: StoryUpdateKind;
  title: string;
  body: string | null;
  occurred_at: string;
  visibility: "public";
  should_generate_adopter_drafts: boolean;
  created_at: string;
  updated_at: string;
};

type AdminListReader = Pick<ContentRepository, "listAdminContent">;

const contentColumns = [
  "id",
  "slug",
  "type",
  "title",
  "subtitle",
  "summary",
  "cover_media_id",
  "status",
  "published_at",
  "cta_label",
  "cta_url",
  "created_at",
  "updated_at",
].join(",");

const profileColumns = [
  "content_item_id",
  "animal_type",
  "public_status",
  "rescue_region",
  "rescue_date",
  "show_on_map",
  "public_map_label",
  "public_lat",
  "public_lng",
  "internal_address",
  "internal_location_notes",
  "is_featured",
].join(",");

const mediaColumns = [
  "id",
  "content_item_id",
  "story_update_id",
  "storage_bucket",
  "storage_path",
  "alt_text",
  "caption",
  "sort_order",
  "is_cover",
  "created_at",
  "updated_at",
].join(",");

const updateColumns = [
  "id",
  "content_item_id",
  "kind",
  "title",
  "body",
  "occurred_at",
  "visibility",
  "should_generate_adopter_drafts",
  "created_at",
  "updated_at",
].join(",");

function nullableNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProfile(row: ProfileRow): RescueStoryProfile {
  return {
    contentItemId: row.content_item_id,
    animalType: row.animal_type,
    publicStatus: row.public_status,
    rescueRegion: row.rescue_region,
    rescueDate: row.rescue_date,
    showOnMap: row.show_on_map,
    publicMapLabel: row.public_map_label,
    publicLat: nullableNumber(row.public_lat),
    publicLng: nullableNumber(row.public_lng),
    internalAddress: row.internal_address,
    internalLocationNotes: row.internal_location_notes,
    isFeatured: row.is_featured,
  };
}

function mapMedia(client: SupabaseClient, row: MediaRow): ContentMedia {
  const { data } = client.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    storyUpdateId: row.story_update_id,
    url: data?.publicUrl || row.storage_path,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    altText: row.alt_text,
    caption: row.caption,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUpdate(row: PublicUpdateRow, media: ContentMedia[]): StoryUpdate {
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

Append the following fixed three-read relation loader and admin assembler:

```ts
async function loadRelations(client: SupabaseClient, contentIds: string[]) {
  const [profilesResult, mediaResult, updatesResult] = await Promise.all([
    client.from("rescue_story_profile").select(profileColumns).in("content_item_id", contentIds),
    client
      .from("content_media")
      .select(mediaColumns)
      .in("content_item_id", contentIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("story_update")
      .select(updateColumns)
      .in("content_item_id", contentIds)
      .eq("visibility", "public")
      .order("occurred_at", { ascending: false }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (updatesResult.error) throw updatesResult.error;

  const profiles = (profilesResult.data ?? []) as unknown as ProfileRow[];
  const mediaRows = (mediaResult.data ?? []) as unknown as MediaRow[];
  const updateRows = (updatesResult.data ?? []) as unknown as PublicUpdateRow[];
  const profilesByContentId = new Map(profiles.map((row) => [row.content_item_id, mapProfile(row)]));
  const media = mediaRows.map((row) => mapMedia(client, row));
  const mediaByContentId = new Map<string, ContentMedia[]>();
  const mediaByUpdateId = new Map<string, ContentMedia[]>();

  for (const item of media) {
    const contentItems = mediaByContentId.get(item.contentItemId) ?? [];
    contentItems.push(item);
    mediaByContentId.set(item.contentItemId, contentItems);
    if (item.storyUpdateId) {
      const updateItems = mediaByUpdateId.get(item.storyUpdateId) ?? [];
      updateItems.push(item);
      mediaByUpdateId.set(item.storyUpdateId, updateItems);
    }
  }

  const latestUpdateByContentId = new Map<string, StoryUpdate>();
  for (const row of updateRows) {
    const update = mapUpdate(row, mediaByUpdateId.get(row.id) ?? []);
    const current = latestUpdateByContentId.get(row.content_item_id);
    if (!current || update.occurredAt > current.occurredAt) {
      latestUpdateByContentId.set(row.content_item_id, update);
    }
  }

  return { profilesByContentId, mediaByContentId, latestUpdateByContentId };
}

function assembleAdminSummary(
  row: ContentListRow,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): ContentSummary {
  const media = relations.mediaByContentId.get(row.id) ?? [];
  const cover = media.find((item) => item.id === row.cover_media_id) ?? null;
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: row.cover_media_id,
    coverImageUrl: cover?.url ?? null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    storyProfile: relations.profilesByContentId.get(row.id) ?? null,
    latestPublicUpdate: relations.latestUpdateByContentId.get(row.id) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string) {
  return value.replace(/[,%()]/g, " ");
}

type StoryFilters = Pick<
  ContentSearch,
  "animalType" | "publicStatus" | "rescueRegion"
>;

function hasStoryFilters(input: StoryFilters) {
  return Boolean(input.animalType || input.publicStatus || input.rescueRegion);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

async function storyFilterContentIds(client: SupabaseClient, input: StoryFilters) {
  if (!hasStoryFilters(input)) return null;

  let query = client.from("rescue_story_profile").select("content_item_id");
  if (input.animalType) query = query.eq("animal_type", input.animalType);
  if (input.publicStatus) query = query.eq("public_status", input.publicStatus);
  if (input.rescueRegion) query = query.eq("rescue_region", input.rescueRegion);

  const { data, error } = await query;
  if (error) throw error;
  return unique(
    ((data ?? []) as Array<{ content_item_id: string }>).map((row) => row.content_item_id),
  );
}

export function createSupabaseContentListRead(client: SupabaseClient): AdminListReader {
  return {
    async listAdminContent(input: ContentSearch) {
      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return { items: [], total: 0 };

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(from, from + input.pageSize - 1);

      if (input.status) query = query.eq("status", input.status);
      if (input.type) query = query.eq("type", input.type);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContentListRow[];
      if (rows.length === 0) return { items: [], total: count ?? 0 };

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return { items: rows.map((row) => assembleAdminSummary(row, relations)), total: count ?? 0 };
    },
  };
}
```

Add this test for the exact five-read contract:

```ts
test("uses exactly five reads for a non-empty story-filtered page", async () => {
  const { client, calls } = createFakeClient([contentRow("1")], {
    rescue_story_profile: [
      { data: [{ content_item_id: "1" }], error: null },
      { data: [profileRow("1")], error: null },
    ],
  });
  const reader = createSupabaseContentListRead(client);

  const result = await reader.listAdminContent({
    animalType: "cat",
    page: 1,
    pageSize: 25,
  });

  expect(result.items).toHaveLength(1);
  expect(calls.map((call) => call.table)).toEqual([
    "rescue_story_profile",
    "content_item",
    "rescue_story_profile",
    "content_media",
    "story_update",
  ]);
});
```

- [ ] **Step 4: Run the admin reader tests**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: PASS for one-row, fifty-row, and story-filtered admin lists. The recorded table sequence is four reads without story filters and five with story filters.

- [ ] **Step 5: Commit the admin reader**

```powershell
git add src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts
git commit -m "feat: add bulk admin content list reader"
```

---

### Task 2: Public Content Summary Parity

**Files:**
- Modify: `src/lib/content/contentListRead.server.ts`
- Modify: `src/lib/content/contentListRead.server.test.ts`

**Interfaces:**
- Consumes: Task 1 `loadRelations`, `ContentSummary`, `PublicContentSearch`, `isSafePublicHref`.
- Produces: `listPublicContent(input: PublicContentSearch): Promise<{ items: ContentSummary[]; total: number }>` on the same reader returned by `createSupabaseContentListRead`.

- [ ] **Step 1: Add failing public parity tests**

Add a fixture with an unsafe CTA, internal profile fields, one public update, one internal-update media row, and media attached to the public update. Assert that public output redacts internal fields, nulls the CTA, excludes the internal media from cover eligibility, and preserves public-update media.

```ts
test("preserves public summary redaction, cover, and latest update media", async () => {
  const row = { ...contentRow("1"), cta_url: "javascript:alert(1)" };
  const { client, calls } = createFakeClient([row], {
    content_media: [
      {
        data: [
          mediaRow("1"),
          {
            ...mediaRow("1"),
            id: "update-media-1",
            story_update_id: "update-1",
            storage_path: "stories/update-1.jpg",
            is_cover: false,
          },
          {
            ...mediaRow("1"),
            id: "internal-media-1",
            story_update_id: "internal-update-1",
            storage_path: "stories/internal-1.jpg",
            is_cover: false,
          },
        ],
        error: null,
      },
    ],
  });
  const reader = createSupabaseContentListRead(client);

  const result = await reader.listPublicContent({ page: 1, pageSize: 25 });

  expect(result.items[0]?.ctaUrl).toBeNull();
  expect(result.items[0]?.storyProfile?.internalAddress).toBeNull();
  expect(result.items[0]?.storyProfile?.internalLocationNotes).toBeNull();
  expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/1.jpg");
  expect(result.items[0]?.latestPublicUpdate?.media.map((item) => item.id)).toEqual([
    "update-media-1",
  ]);
  expect(calls).toHaveLength(4);
  expect(calls[0]?.filters).toContainEqual({ method: "eq", column: "status", value: "published" });
  expect(calls[3]?.filters).toContainEqual({
    method: "eq",
    column: "visibility",
    value: "public",
  });
});

test("returns null public relationships when profile, media, and updates are absent", async () => {
  const { client } = createFakeClient([contentRow("1")], {
    rescue_story_profile: [{ data: [], error: null }],
    content_media: [{ data: [], error: null }],
    story_update: [{ data: [], error: null }],
  });
  const reader = createSupabaseContentListRead(client);

  const result = await reader.listPublicContent({ page: 1, pageSize: 25 });

  expect(result.items[0]?.storyProfile).toBeNull();
  expect(result.items[0]?.coverImageUrl).toBeNull();
  expect(result.items[0]?.latestPublicUpdate).toBeNull();
});

test("does not expose cover media attached to an internal update", async () => {
  const row = { ...contentRow("1"), cover_media_id: "internal-media-1" };
  const { client } = createFakeClient([row], {
    content_media: [
      {
        data: [
          {
            ...mediaRow("1"),
            id: "internal-media-1",
            story_update_id: "internal-update-1",
          },
        ],
        error: null,
      },
    ],
  });
  const reader = createSupabaseContentListRead(client);

  const result = await reader.listPublicContent({ page: 1, pageSize: 25 });

  expect(result.items[0]?.coverMediaId).toBeNull();
  expect(result.items[0]?.coverImageUrl).toBeNull();
});
```

Use the `FakeClientOverrides` support created in Task 1 for the empty and media-specific queues above; no additional test adapter is introduced in this task.

- [ ] **Step 2: Run the public tests and verify the red state**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: FAIL because the Task 1 reader does not expose `listPublicContent`.

- [ ] **Step 3: Implement public summary projection**

Expand the reader type and add a public assembler. Public cover eligibility must match `toPublicContentDetail`: root media is visible; update media is visible only when its `storyUpdateId` belongs to a public update.

```ts
import { isSafePublicHref, type ContentSearch, type PublicContentSearch } from "./schemas";

type ContentListReader = Pick<
  ContentRepository,
  "listAdminContent" | "listPublicContent"
>;
```

Replace the existing factory return annotation exactly as follows; retain the complete Task 1 admin method in the returned object:

```diff
-export function createSupabaseContentListRead(client: SupabaseClient): AdminListReader {
+export function createSupabaseContentListRead(client: SupabaseClient): ContentListReader {
```

Add the public assembler:

```ts

function assemblePublicSummary(
  row: ContentListRow,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): ContentSummary {
  const profile = relations.profilesByContentId.get(row.id) ?? null;
  const latestUpdate = relations.latestUpdateByContentId.get(row.id) ?? null;
  const publicUpdateIds = relations.publicUpdateIdsByContentId.get(row.id) ?? new Set();
  const visibleMedia = (relations.mediaByContentId.get(row.id) ?? []).filter(
    (item) => item.storyUpdateId === null || publicUpdateIds.has(item.storyUpdateId),
  );
  const cover = visibleMedia.find((item) => item.id === row.cover_media_id) ?? null;

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: cover?.id ?? null,
    coverImageUrl: cover?.url ?? null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: isSafePublicHref(row.cta_url) ? row.cta_url : null,
    storyProfile: profile
      ? { ...profile, internalAddress: null, internalLocationNotes: null }
      : null,
    latestPublicUpdate: latestUpdate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

Add the complete public-update ID map to `loadRelations` before its update loop:

```ts
  const latestUpdateByContentId = new Map<string, StoryUpdate>();
  const publicUpdateIdsByContentId = new Map<string, Set<string>>();
  for (const row of updateRows) {
    const ids = publicUpdateIdsByContentId.get(row.content_item_id) ?? new Set<string>();
    ids.add(row.id);
    publicUpdateIdsByContentId.set(row.content_item_id, ids);

    const update = mapUpdate(row, mediaByUpdateId.get(row.id) ?? []);
    const current = latestUpdateByContentId.get(row.content_item_id);
    if (!current || update.occurredAt > current.occurredAt) {
      latestUpdateByContentId.set(row.content_item_id, update);
    }
  }

  return {
    profilesByContentId,
    mediaByContentId,
    latestUpdateByContentId,
    publicUpdateIdsByContentId,
  };
```

Expand the factory with this exact public method:

```ts
    async listPublicContent(input: PublicContentSearch) {
      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return { items: [], total: 0 };

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns, { count: "exact" })
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.type) query = query.eq("type", input.type);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContentListRow[];
      if (rows.length === 0) return { items: [], total: count ?? 0 };

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) => assemblePublicSummary(row, relations)),
        total: count ?? 0,
      };
    },
```

- [ ] **Step 4: Run focused public parity tests**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts src/lib/content/repositoryMapping.test.ts src/components/site/stories/StoryWall.test.tsx
```

Expected: PASS. The new module tests prove four reads and public redaction; existing mapping and Story Wall tests prove no visible contract regression.

- [ ] **Step 5: Commit public list support**

```powershell
git add src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts
git commit -m "feat: add bulk public content list reader"
```

---

### Task 3: Story Map, Empty Pages, And Error Semantics

**Files:**
- Modify: `src/lib/content/contentListRead.server.ts`
- Modify: `src/lib/content/contentListRead.server.test.ts`

**Interfaces:**
- Consumes: Task 2 `assemblePublicSummary`, `ContentSummary`, `PublicContentSearch`.
- Produces: the final `ContentListReadModule = Pick<ContentRepository, "listAdminContent" | "listPublicContent" | "listPublicMapStories">`.

- [ ] **Step 1: Add failing map, empty-page, ordering, and error tests**

```ts
test("projects public story map points and filters invalid locations", async () => {
  const rows = [contentRow("1"), contentRow("2")];
  const { client, calls } = createFakeClient(rows, {
    rescue_story_profile: [
      {
        data: [profileRow("1"), { ...profileRow("2"), show_on_map: false }],
        error: null,
      },
    ],
  });
  const reader = createSupabaseContentListRead(client);

  const points = await reader.listPublicMapStories({ page: 1, pageSize: 25 });

  expect(points).toHaveLength(1);
  expect(points[0]?.slug).toBe("story-1");
  expect(calls).toHaveLength(4);
});

test("keeps content page ordering regardless of relation row order", async () => {
  const rows = [contentRow("2"), contentRow("1")];
  const { client } = createFakeClient(rows, {
    rescue_story_profile: [{ data: [profileRow("1"), profileRow("2")], error: null }],
  });
  const reader = createSupabaseContentListRead(client);

  const result = await reader.listAdminContent({ page: 1, pageSize: 25 });

  expect(result.items.map((item) => item.id)).toEqual(["2", "1"]);
});

test("skips relation reads for empty pages", async () => {
  const { client, calls } = createFakeClient([]);
  const reader = createSupabaseContentListRead(client);

  await expect(reader.listAdminContent({ page: 1, pageSize: 25 })).resolves.toEqual({
    items: [],
    total: 0,
  });
  expect(calls).toHaveLength(1);
});

for (const table of [
  "content_item",
  "rescue_story_profile",
  "content_media",
  "story_update",
] as const) {
  test(`rejects the whole list when ${table} fails`, async () => {
    const failure = new Error(`${table} unavailable`);
    const { client } = createFakeClient([contentRow("1")], {
      [table]: [{ data: null, error: failure }],
    });
    const reader = createSupabaseContentListRead(client);

    await expect(reader.listAdminContent({ page: 1, pageSize: 25 })).rejects.toBe(failure);
  });
}

test("rejects the whole list when the story prefilter fails", async () => {
  const failure = new Error("story filter unavailable");
  const { client } = createFakeClient([contentRow("1")], {
    rescue_story_profile: [{ data: null, error: failure }],
  });
  const reader = createSupabaseContentListRead(client);

  await expect(
    reader.listAdminContent({ animalType: "cat", page: 1, pageSize: 25 }),
  ).rejects.toBe(failure);
});
```

Also add these two profile-filter tests:

```ts
test("uses two reads when a story filter matches IDs but the content page is empty", async () => {
  const { client, calls } = createFakeClient([], {
    rescue_story_profile: [{ data: [{ content_item_id: "missing" }], error: null }],
  });
  const reader = createSupabaseContentListRead(client);

  await expect(
    reader.listAdminContent({ animalType: "cat", page: 1, pageSize: 25 }),
  ).resolves.toEqual({ items: [], total: 0 });
  expect(calls.map((call) => call.table)).toEqual([
    "rescue_story_profile",
    "content_item",
  ]);
});

test("uses one read when a story filter matches no content IDs", async () => {
  const { client, calls } = createFakeClient([], {
    rescue_story_profile: [{ data: [], error: null }],
  });
  const reader = createSupabaseContentListRead(client);

  await expect(
    reader.listAdminContent({ animalType: "cat", page: 1, pageSize: 25 }),
  ).resolves.toEqual({ items: [], total: 0 });
  expect(calls.map((call) => call.table)).toEqual(["rescue_story_profile"]);
});
```

- [ ] **Step 2: Run the tests and verify the red state**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: FAIL because `listPublicMapStories` is not yet exposed and the fake override/error cases are not all handled.

- [ ] **Step 3: Implement map projection and final module interface**

```ts
import type { PublicStoryMapPoint } from "./types";

export type ContentListReadModule = Pick<
  ContentRepository,
  "listAdminContent" | "listPublicContent" | "listPublicMapStories"
>;
```

Replace the factory return annotation exactly as follows:

```diff
-export function createSupabaseContentListRead(client: SupabaseClient): ContentListReader {
+export function createSupabaseContentListRead(client: SupabaseClient): ContentListReadModule {
```

Add the map projection helpers:

```ts

function nonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function mapStoryPoint(content: ContentSummary): PublicStoryMapPoint | null {
  const profile = content.storyProfile;
  if (!profile?.showOnMap) return null;
  if (!profile.publicMapLabel?.trim()) return null;
  if (profile.publicLat === null || profile.publicLng === null) return null;
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

function mapStoryPoints(
  rows: ContentListRow[],
  relations: Awaited<ReturnType<typeof loadRelations>>,
): PublicStoryMapPoint[] {
  return rows
    .map((row) => mapStoryPoint(assemblePublicSummary(row, relations)))
    .filter(nonNullable);
}
```

Add this exact final method to the factory:

```ts
    async listPublicMapStories(input: PublicContentSearch) {
      if (input.type && input.type !== "rescue_story") return [];

      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return [];

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns)
        .eq("status", "published")
        .eq("type", "rescue_story")
        .order("published_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContentListRow[];
      if (rows.length === 0) return [];

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return mapStoryPoints(rows, relations);
    },
```

- [ ] **Step 4: Run all new module tests**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: PASS for query counts, admin/public parity, story map projection, ordering, empty pages, story-filter short circuits, and each relation error.

- [ ] **Step 5: Commit story map and edge behavior**

```powershell
git add src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts
git commit -m "feat: add bulk story map content reader"
```

---

### Task 4: Repository Delegation And Full Regression Gate

**Files:**
- Modify: `src/lib/content/repository.server.ts:544-600`
- Modify: `src/lib/content/repository.server.ts:657-789`
- Modify: `src/lib/content/contentListRead.server.test.ts`

**Interfaces:**
- Consumes: Task 3 `createSupabaseContentListRead(client): ContentListReadModule`.
- Produces: unchanged `createSupabaseContentRepository(client): ContentRepository` with its three list methods delegated to the deep read module.

- [ ] **Step 1: Add the failing repository delegation test**

```ts
import { createSupabaseContentRepository } from "./repository.server";

test("content repository delegates admin lists to the fixed-count reader", async () => {
  const { client, calls } = createFakeClient([contentRow("1")]);
  const repository = createSupabaseContentRepository(client);

  const result = await repository.listAdminContent({ page: 1, pageSize: 25 });

  expect(result.items).toHaveLength(1);
  expect(calls.map((call) => call.table)).toEqual([
    "content_item",
    "rescue_story_profile",
    "content_media",
    "story_update",
  ]);
});
```

- [ ] **Step 2: Run the delegation test and verify the red state**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts -t "content repository delegates"
```

Expected: FAIL because the repository still calls serial `hydrateContentDetails` and requests detail-only tables.

- [ ] **Step 3: Delegate the three repository methods and remove dead list helpers**

At the top of `repository.server.ts`:

```ts
import { createSupabaseContentListRead } from "./contentListRead.server";
```

At the start of `createSupabaseContentRepository`:

```ts
export function createSupabaseContentRepository(client: SupabaseClient): ContentRepository {
  const contentListRead = createSupabaseContentListRead(client);

  return {
    listPublicContent(input) {
      return contentListRead.listPublicContent(input);
    },
```

Replace the old `listPublicMapStories` and `listAdminContent` implementations with:

```ts
    listPublicMapStories(input) {
      return contentListRead.listPublicMapStories(input);
    },

    listAdminContent(input) {
      return contentListRead.listAdminContent(input);
    },
```

Delete only the helpers made unused by these three delegates:

- `hydrateContentDetails`
- `hasStoryFilters`
- `storyFilterContentIds`
- `escapeLike`
- `nonNullable`

Keep `hydrateContentDetail`, `unique`, all detail mappers, and every mutation implementation. Run TypeScript/ESLint after deletion to catch any helper that still has a non-list caller before removing it.

- [ ] **Step 4: Run focused content regression tests**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts src/lib/content/repositoryMapping.test.ts src/lib/content/service.test.ts src/lib/content/http.test.ts src/components/admin/content/ContentManagement.test.tsx src/components/admin/content/ContentEditor.test.tsx src/components/site/stories/StoryWall.test.tsx
```

Expected: PASS with zero failures. The new query-count tests and all existing content contracts pass together.

- [ ] **Step 5: Run lint and build**

Run:

```powershell
bunx eslint src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts src/lib/content/repository.server.ts --rule "prettier/prettier: off"
bun run build
```

Expected: ESLint exits 0 and the production build exits 0. Existing unrelated build warnings may remain, but no new errors or warnings may point to the three touched files.

- [ ] **Step 6: Verify scope and query-plan evidence**

Run:

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors; only the approved content read module, tests, repository delegation, and planning/spec documents are changed. No migration, client, route, service, schema, or dependency file is present in the diff.

The implementation proves removal of the N+1 pattern with deterministic query counts. Do not add indexes based on this change alone. If production remains slow after deployment, collect `EXPLAIN (ANALYZE, BUFFERS)` evidence in a separate task before proposing an index, following Supabase query-optimization guidance: https://supabase.com/docs/guides/database/query-optimization

- [ ] **Step 7: Commit the repository integration**

```powershell
git add src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts src/lib/content/repository.server.ts
git commit -m "refactor: delegate content lists to bulk reader"
```

---

## Plan Self-Review

- Spec coverage: all three list methods, fixed query counts, parity, errors, empty pages, rollback scope, and no-migration constraints map to explicit tasks.
- Incomplete-marker scan: no unresolved implementation markers remain.
- Type consistency: `createSupabaseContentListRead` expands task-by-task and ends as `ContentListReadModule`, a `Pick` of the unchanged repository interface.
- Dependency check: the new module imports only schemas, rules, service types, domain types, Supabase types, and no repository implementation, so there is no circular import.
- Scope check: detail hydration, authoring, routes, clients, migrations, dependencies, and pagination contracts remain unchanged.
