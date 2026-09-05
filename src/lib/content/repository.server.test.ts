import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseContentRepository } from "./repository.server";

function createFakeClient(
  createSignedUploadUrl: (path: string) => Promise<{
    data: { token: string; path: string } | null;
    error: { message: string } | null;
  }>,
) {
  const storageCalls: string[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUploadUrl(path: string) {
            storageCalls.push(`${bucket}:${path}`);
            return createSignedUploadUrl(path);
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, storageCalls };
}

describe("createSupabaseContentRepository createSignedUploadUrl", () => {
  test("resolves to the token and path Supabase's Storage API returns, against the content-media bucket", async () => {
    const fake = createFakeClient(async (path) => ({
      data: { token: "signed-token", path },
      error: null,
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/siu-bak/checkup.jpg")).resolves.toEqual({
      token: "signed-token",
      path: "stories/siu-bak/checkup.jpg",
    });
    expect(fake.storageCalls).toEqual(["content-media:stories/siu-bak/checkup.jpg"]);
  });

  test("throws when Supabase Storage returns an error", async () => {
    const fake = createFakeClient(async () => ({
      data: null,
      error: { message: "bucket not found" },
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/broken.jpg")).rejects.toEqual({
      message: "bucket not found",
    });
  });

  test("throws a descriptive error when Storage responds without a token or path", async () => {
    const fake = createFakeClient(async () => ({
      data: null,
      error: null,
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/incomplete.jpg")).rejects.toThrow(
      "Storage did not return an upload target",
    );
  });
});

test("one or fifty private admin covers use one projection and one signing batch", async () => {
  for (const size of [1, 50]) {
    let rpcCalls = 0;
    let signingCalls = 0;
    const rows = Array.from({ length: size }, (_, index) => ({
      content: {
        id: `content-${index}`,
        title: "Synthetic",
        slug: `slug-${index}`,
        type: "event",
        summary: "Summary",
        status: "draft",
        cover_media_id: `media-${index}`,
        created_at: "2026-09-01",
        updated_at: "2026-09-01",
      },
      profile: null,
      updates: [],
      media: [
        {
          id: `media-${index}`,
          content_item_id: `content-${index}`,
          story_update_id: null,
          storage_bucket: "content-media-private",
          storage_path: `private/${index}.png`,
          alt_text: "Synthetic",
          is_cover: true,
        },
      ],
    }));
    const client = {
      rpc: async () => {
        rpcCalls++;
        return { data: { total: size, rows }, error: null };
      },
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            signingCalls++;
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://example.test/${path}` })),
              error: null,
            };
          },
        }),
      },
    } as unknown as SupabaseClient;
    const result = await createSupabaseContentRepository(client).listAdminContent({
      page: 1,
      pageSize: size,
    });
    expect(result.items).toHaveLength(size);
    expect(rpcCalls).toBe(1);
    expect(signingCalls).toBe(1);
    expect(result.items[0].coverImageUrl).toContain("https://example.test/");
  }
});

test("detail pages stay bounded while cover and latest summary remain independent", async () => {
  const content = {
    id: "content",
    title: "Synthetic",
    slug: "synthetic",
    type: "event",
    summary: "Summary",
    status: "draft",
    cover_media_id: "cover",
  };
  const media = (id: string) => ({
    id,
    content_item_id: "content",
    story_update_id: null,
    storage_bucket: "content-media",
    storage_path: `${id}.jpg`,
    alt_text: id,
    is_cover: id === "cover",
  });
  const updates = Array.from({ length: 21 }, (_, index) => ({
    id: `update-${index}`,
    content_item_id: "content",
    title: "History",
    occurred_at: "2026-01-01",
    visibility: "public",
    kind: "general",
    body: "Should not be returned",
  }));
  const snapshot = {
    content,
    profile: null,
    cover: media("cover"),
    latest: { ...updates[0], id: "latest" },
    links: [],
    media: Array.from({ length: 21 }, (_, index) => media(`history-${index}`)),
    updates,
    socialCopies: [],
    notificationDrafts: [],
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: content, error: null }),
  };
  const client = {
    from: () => query,
    rpc: async () => ({ data: snapshot, error: null }),
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  const detail = await createSupabaseContentRepository(client).getAdminContent("content", 2);
  expect(detail?.media).toHaveLength(20);
  expect(detail?.updates).toHaveLength(20);
  expect(detail?.history).toEqual({ page: 2, hasMore: true });
  expect(detail?.updates[0].body).toBeNull();
  expect(detail?.coverImageUrl).toBe("https://example.test/cover.jpg");
  expect(detail?.latestPublicUpdate?.id).toBe("latest");
});

test("detail page and its separate private cover share one signing batch", async () => {
  const content = {
    id: "content",
    title: "Synthetic",
    slug: "synthetic",
    type: "event",
    summary: "Summary",
    status: "draft",
    cover_media_id: "cover",
  };
  const media = (id: string) => ({
    id,
    content_item_id: "content",
    story_update_id: null,
    storage_bucket: "content-media-private",
    storage_path: `${id}.jpg`,
    alt_text: id,
    is_cover: id === "cover",
  });
  const snapshot = {
    content,
    profile: null,
    cover: media("cover"),
    latest: null,
    links: [],
    media: Array.from({ length: 21 }, (_, index) => media(`history-${index}`)),
    updates: [],
    socialCopies: [],
    notificationDrafts: [],
  };
  let batches = 0;
  let paths: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: content, error: null }),
  };
  const client = {
    from: () => query,
    rpc: async () => ({ data: snapshot, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: async (input: string[]) => {
          batches++;
          paths = input;
          return {
            data: input.map((path) => ({ path, signedUrl: `https://example.test/${path}` })),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const detail = await createSupabaseContentRepository(client).getAdminContent("content", 2);
  expect(batches).toBe(1);
  expect(paths).toHaveLength(21);
  expect(paths).not.toContain("history-20.jpg");
  expect(detail?.media).toHaveLength(20);
  expect(detail?.coverImageUrl).toBe("https://example.test/cover.jpg");
});
