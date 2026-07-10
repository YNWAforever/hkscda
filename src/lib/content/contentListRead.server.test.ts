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
      expect(result.items[0]?.coverImageUrl).toBe("https://cdn.test/content/stories/1.jpg");
      expect(result.items[0]?.latestPublicUpdate?.title).toBe("Update 1");
      expect(calls.map((call) => call.table)).toEqual([
        "content_item",
        "rescue_story_profile",
        "content_media",
        "story_update",
      ]);
    }
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
  });
});
