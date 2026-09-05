import { expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseContentRepository } from "./repository.server";

test("public detail uses a saved snapshot without authoring table reads", async () => {
  const rpc = mock(async () => ({
    data: {
      total: 1,
      rows: [
        {
          published_at: "2026-09-05T00:00:00Z",
          snapshot: {
            content: {
              id: "content-1",
              slug: "saved-slug",
              type: "event",
              title: "Reviewed title",
              status: "published",
              cover_media_id: null,
            },
            profile: null,
            updates: [],
            media: [],
          },
        },
      ],
    },
    error: null,
  }));
  const from = mock(() => {
    throw new Error("Mutable authoring read");
  });
  const client = { rpc, from } as unknown as SupabaseClient;
  const detail = await createSupabaseContentRepository(client).getPublicContentBySlug("saved-slug");
  expect(detail?.title).toBe("Reviewed title");
  expect(detail?.publishedAt).toBe("2026-09-05T00:00:00Z");
  expect(from).not.toHaveBeenCalled();
});

test("public list returns summaries without full history or body", async () => {
  const client = {
    rpc: async () => ({
      data: {
        total: 1,
        rows: [
          {
            published_at: null,
            snapshot: {
              content: {
                id: "content-1",
                slug: "saved",
                type: "event",
                title: "Saved",
                body: "Long body",
                status: "published",
                cover_media_id: null,
              },
              profile: null,
              updates: [],
              media: [],
            },
          },
        ],
      },
      error: null,
    }),
  } as unknown as SupabaseClient;
  const { items } = await createSupabaseContentRepository(client).listPublicContent({
    page: 1,
    pageSize: 25,
    status: "published",
  });
  expect(items[0]).not.toHaveProperty("body");
  expect(items[0]).not.toHaveProperty("updates");
  expect(items[0]).not.toHaveProperty("media");
});

test("map excludes an explicitly requested non-story type without reading", async () => {
  const rpc = mock(async () => ({ data: { total: 0, rows: [] }, error: null }));
  const client = { rpc } as unknown as SupabaseClient;
  const points = await createSupabaseContentRepository(client).listPublicMapStories({
    type: "event",
    page: 1,
    pageSize: 25,
    status: "published",
  });
  expect(points).toEqual([]);
  expect(rpc).not.toHaveBeenCalled();
});
