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

    await expect(repository.createSignedUploadUrl("stories/siu-bak/checkup.jpg")).resolves.toEqual(
      {
        token: "signed-token",
        path: "stories/siu-bak/checkup.jpg",
      },
    );
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
