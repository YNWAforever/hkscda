import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseContentListRead } from "./contentListRead.server";
import { createSupabaseContentRepository } from "./repository.server";

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

  maybeSingle() {
    return {
      then: (
        resolve: (value: Omit<FakeResponse, "data"> & { data: unknown | null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        this.calls.push(structuredClone(this.trace));
        const queue = this.responses.get(this.trace.table) ?? [];
        const response = queue.shift() ?? { data: [], error: null, count: null };
        const data = Array.isArray(response.data) ? (response.data[0] ?? null) : response.data;
        return Promise.resolve({ ...response, data }).then(resolve, reject);
      },
    };
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

type FakeClientOverrides = Partial<
  Record<"content_item" | "rescue_story_profile" | "content_media" | "story_update", FakeResponse[]>
>;

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

function expectRelationContentIds(calls: QueryTrace[], contentIds: string[]) {
  for (const call of calls) {
    expect(call.filters).toContainEqual({
      method: "in",
      column: "content_item_id",
      value: contentIds,
    });
  }
}

describe("createSupabaseContentListRead", () => {
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

  test("lists one or fifty admin summaries with exactly four reads", async () => {
    for (const size of [1, 50]) {
      const rows = Array.from({ length: size }, (_, index) => contentRow(String(index + 1)));
      const { client, calls } = createFakeClient(rows);
      const reader = createSupabaseContentListRead(client);

      const result = await reader.listAdminContent({ page: 1, pageSize: size });

      expect(result.total).toBe(size);
      expect(result.items).toHaveLength(size);
      expect(result.items[0]?.storyProfile?.internalAddress).toBe("Internal 1");
      expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/1.jpg");
      expect(result.items[0]?.latestPublicUpdate?.title).toBe("Update 1");
      expect(calls.map((call) => call.table)).toEqual([
        "content_item",
        "rescue_story_profile",
        "content_media",
        "story_update",
      ]);
      expectRelationContentIds(
        calls.slice(1),
        rows.map((row) => row.id),
      );
    }
  });

  test("falls back to the first ordered cover media for null and stale admin cover ids", async () => {
    for (const coverMediaId of [null, "stale-media-id"]) {
      const row = { ...contentRow("1"), cover_media_id: coverMediaId } as ReturnType<
        typeof contentRow
      >;
      const { client } = createFakeClient([row], {
        content_media: [
          {
            data: [
              { ...mediaRow("1"), id: "first-cover", storage_path: "stories/first.jpg" },
              {
                ...mediaRow("1"),
                id: "second-cover",
                storage_path: "stories/second.jpg",
                sort_order: 1,
              },
            ],
            error: null,
          },
        ],
      });
      const reader = createSupabaseContentListRead(client);

      const result = await reader.listAdminContent({ page: 1, pageSize: 25 });

      expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/first.jpg");
    }
  });

  test("falls back to public-eligible cover media for null and stale public cover ids", async () => {
    for (const coverMediaId of [null, "stale-media-id"]) {
      const row = { ...contentRow("1"), cover_media_id: coverMediaId } as ReturnType<
        typeof contentRow
      >;
      const { client } = createFakeClient([row], {
        content_media: [
          {
            data: [
              {
                ...mediaRow("1"),
                id: "internal-cover",
                story_update_id: "internal-update",
                storage_path: "stories/internal.jpg",
              },
              {
                ...mediaRow("1"),
                id: "root-cover",
                storage_path: "stories/root.jpg",
                sort_order: 1,
              },
              {
                ...mediaRow("1"),
                id: "public-update-cover",
                story_update_id: "update-1",
                storage_path: "stories/public-update.jpg",
                sort_order: 2,
              },
            ],
            error: null,
          },
        ],
      });
      const reader = createSupabaseContentListRead(client);

      const result = await reader.listPublicContent({ status: "published", page: 1, pageSize: 25 });

      expect(result.items[0]?.coverMediaId).toBe("root-cover");
      expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/root.jpg");
    }
  });

  for (const [input, filter] of [
    ["%", "title.ilike.%\\%%,summary.ilike.%\\%%"],
    ["_", "title.ilike.%\\_%,summary.ilike.%\\_%"],
    ["\\", "title.ilike.%\\\\%,summary.ilike.%\\\\%"],
    [",", "title.ilike.%,%,summary.ilike.%,%"],
    ["()", "title.ilike.%()%,summary.ilike.%()%"],
  ]) {
    test(`preserves legacy search escaping for ${JSON.stringify(input)}`, async () => {
      const { client, calls } = createFakeClient([]);
      const reader = createSupabaseContentListRead(client);

      await reader.listAdminContent({ page: 1, pageSize: 25, q: input });

      expect(calls[0]?.filters).toContainEqual({ method: "or", column: "or", value: filter });
    });
  }

  test("applies admin filters, ordering, and offset pagination before bulk relation reads", async () => {
    const rows = [contentRow("11"), contentRow("12")];
    const { client, calls } = createFakeClient(rows);
    const reader = createSupabaseContentListRead(client);

    await reader.listAdminContent({
      page: 3,
      pageSize: 2,
      status: "published",
      type: "rescue_story",
      q: "Mimi",
    });

    expect(calls[0]).toMatchObject({
      table: "content_item",
      filters: [
        { method: "eq", column: "status", value: "published" },
        { method: "eq", column: "type", value: "rescue_story" },
        {
          method: "or",
          column: "or",
          value: "title.ilike.%Mimi%,summary.ilike.%Mimi%",
        },
      ],
      orders: [
        { column: "updated_at", options: { ascending: false } },
        { column: "published_at", options: { ascending: false, nullsFirst: false } },
      ],
      range: [4, 5],
    });
    expectRelationContentIds(calls.slice(1), ["11", "12"]);
    expect(calls[2]).toMatchObject({
      orders: [
        { column: "sort_order", options: { ascending: true } },
        { column: "created_at", options: { ascending: true } },
      ],
    });
    expect(calls[3]).toMatchObject({
      filters: [
        { method: "in", column: "content_item_id", value: ["11", "12"] },
        { method: "eq", column: "visibility", value: "public" },
      ],
      orders: [{ column: "occurred_at", options: { ascending: false } }],
    });
  });

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
    expect(calls[0]).toMatchObject({
      filters: [{ method: "eq", column: "animal_type", value: "cat" }],
    });
    expect(calls[1]).toMatchObject({
      filters: [{ method: "in", column: "id", value: ["1"] }],
      range: [0, 24],
    });
    expectRelationContentIds(calls.slice(2), ["1"]);
  });

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

    const result = await reader.listPublicContent({ status: "published", page: 1, pageSize: 25 });

    expect(result.items[0]?.ctaUrl).toBeNull();
    expect(result.items[0]?.storyProfile?.internalAddress).toBeNull();
    expect(result.items[0]?.storyProfile?.internalLocationNotes).toBeNull();
    expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/1.jpg");
    expect(result.items[0]?.latestPublicUpdate?.media.map((item) => item.id)).toEqual([
      "update-media-1",
    ]);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.filters).toContainEqual({
      method: "eq",
      column: "status",
      value: "published",
    });
    expect(calls[3]?.filters).toContainEqual({
      method: "eq",
      column: "visibility",
      value: "public",
    });
  });

  test("rejects unpublished rows leaked through the public query", async () => {
    const leakedDraft = { ...contentRow("draft-1"), status: "draft" as const };
    const { client, calls } = createFakeClient([leakedDraft]);
    const reader = createSupabaseContentListRead(client);

    const result = await reader.listPublicStoriesPage({
      status: "published",
      page: 1,
      pageSize: 25,
    });

    expect(result).toEqual({ items: [], total: 0, points: [] });
    expect(calls).toHaveLength(1);
  });

  test("returns null public relationships when profile, media, and updates are absent", async () => {
    const { client } = createFakeClient([contentRow("1")], {
      rescue_story_profile: [{ data: [], error: null }],
      content_media: [{ data: [], error: null }],
      story_update: [{ data: [], error: null }],
    });
    const reader = createSupabaseContentListRead(client);

    const result = await reader.listPublicContent({ status: "published", page: 1, pageSize: 25 });

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

    const result = await reader.listPublicContent({ status: "published", page: 1, pageSize: 25 });

    expect(result.items[0]?.coverMediaId).toBeNull();
    expect(result.items[0]?.coverImageUrl).toBeNull();
  });

  test("combines public story cards and map points in one relation load", async () => {
    const rows = [
      { ...contentRow("story-1"), cover_media_id: "internal-cover" },
      contentRow("story-2"),
    ];
    const { client, calls } = createFakeClient(rows, {
      rescue_story_profile: [
        {
          data: [profileRow("story-1"), { ...profileRow("story-2"), show_on_map: false }],
          error: null,
        },
      ],
      content_media: [
        {
          data: [
            {
              ...mediaRow("story-1"),
              id: "internal-cover",
              story_update_id: "internal-update-story-1",
            },
            mediaRow("story-2"),
          ],
          error: null,
        },
      ],
    });
    const reader = createSupabaseContentListRead(client);

    const result = await reader.listPublicStoriesPage({
      page: 1,
      pageSize: 25,
      status: "published",
    });

    expect(result.items).toHaveLength(2);
    expect(result.points.map((point) => point.id)).toEqual(["story-1"]);
    expect(result.items[0]?.coverImageUrl).toBeNull();
    expect(calls.filter((call) => call.table === "content_item")).toHaveLength(1);
    expect(calls.filter((call) => call.table === "rescue_story_profile")).toHaveLength(1);
    expect(calls.filter((call) => call.table === "content_media")).toHaveLength(1);
    expect(calls.filter((call) => call.table === "story_update")).toHaveLength(1);
  });
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

    const points = await reader.listPublicMapStories({
      status: "published",
      page: 1,
      pageSize: 25,
    });

    expect(points).toHaveLength(1);
    expect(points[0]?.slug).toBe("story-1");
    expect(calls).toHaveLength(4);
  });

  test("excludes public map stories with blank map labels", async () => {
    const { client } = createFakeClient([contentRow("1")], {
      rescue_story_profile: [
        { data: [{ ...profileRow("1"), public_map_label: " \t " }], error: null },
      ],
    });
    const reader = createSupabaseContentListRead(client);

    await expect(
      reader.listPublicMapStories({ status: "published", page: 1, pageSize: 25 }),
    ).resolves.toEqual([]);
  });

  test("excludes public map stories with null latitude or longitude", async () => {
    const { client } = createFakeClient([contentRow("1"), contentRow("2")], {
      rescue_story_profile: [
        {
          data: [
            { ...profileRow("1"), public_lat: null },
            { ...profileRow("2"), public_lng: null },
          ],
          error: null,
        },
      ],
    });
    const reader = createSupabaseContentListRead(client);

    await expect(
      reader.listPublicMapStories({ status: "published", page: 1, pageSize: 25 }),
    ).resolves.toEqual([]);
  });

  test("excludes public map stories with non-numeric latitude or longitude", async () => {
    const { client } = createFakeClient([contentRow("1"), contentRow("2")], {
      rescue_story_profile: [
        {
          data: [
            { ...profileRow("1"), public_lat: "north" },
            { ...profileRow("2"), public_lng: "east" },
          ],
          error: null,
        },
      ],
    });
    const reader = createSupabaseContentListRead(client);

    await expect(
      reader.listPublicMapStories({ status: "published", page: 1, pageSize: 25 }),
    ).resolves.toEqual([]);
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

  test("uses two reads when a story filter matches IDs but the content page is empty", async () => {
    const { client, calls } = createFakeClient([], {
      rescue_story_profile: [{ data: [{ content_item_id: "missing" }], error: null }],
    });
    const reader = createSupabaseContentListRead(client);

    await expect(
      reader.listAdminContent({ animalType: "cat", page: 1, pageSize: 25 }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(calls.map((call) => call.table)).toEqual(["rescue_story_profile", "content_item"]);
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
});
