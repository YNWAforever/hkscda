import { describe, expect, mock, test } from "bun:test";

import { createSignedUploadUrls, verifyUploadedObjects } from "./signedUpload.server";

function fakeStorageClient({
  signedUrlData,
  signedUrlError,
  listData,
  listError,
}: {
  signedUrlData?: { path: string; signedUrl: string; token: string };
  signedUrlError?: unknown;
  listData?: Array<{ name: string; metadata: { size: number; mimetype: string } | null }>;
  listError?: unknown;
} = {}) {
  // `from()` must return the same object (with the same mock instances) on
  // every call, so assertions can inspect the mocks that the code under test
  // actually invoked. `fromResult` is returned alongside `client` for that
  // purpose, since `client` itself is typed `never` for passing into
  // functions that expect a real `SupabaseClient`.
  const fromResult = {
    createSignedUploadUrl: mock(async () => ({
      data: signedUrlData ?? null,
      error: signedUrlError ?? null,
    })),
    list: mock(async () => ({ data: listData ?? [], error: listError ?? null })),
  };
  const client = {
    storage: {
      from: () => fromResult,
    },
  } as never;
  return { client, fromResult };
}

describe("createSignedUploadUrls", () => {
  test("builds a path per descriptor and returns the signed URL data", async () => {
    const { client } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    });
    const results = await createSignedUploadUrls(client, "adoption-application-photos", "draft-1", [
      { category: "home", fileName: "photo.jpg" },
    ]);
    expect(results).toEqual([
      { category: "home", path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    ]);
  });

  test("sanitizes unsafe characters out of the file name", async () => {
    const { client, fromResult } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/weird_name.jpg", signedUrl: "u", token: "t" },
    });
    await createSignedUploadUrls(client, "bucket", "draft-1", [
      { category: "home", fileName: "weird name!@#.jpg" },
    ]);
    expect(fromResult.createSignedUploadUrl).toHaveBeenCalledWith("draft-1/home/weird_name___.jpg");
  });

  test("throws when the signed URL request errors", async () => {
    const { client } = fakeStorageClient({ signedUrlError: new Error("boom") });
    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [
        { category: "home", fileName: "a.jpg" },
      ]),
    ).rejects.toThrow("boom");
  });
});

describe("verifyUploadedObjects", () => {
  test("returns ok when every object exists with matching metadata", async () => {
    const { client } = fakeStorageClient({
      listData: [{ name: "photo.jpg", metadata: { size: 100, mimetype: "image/jpeg" } }],
    });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: true });
  });

  test("reports a path as missing when list returns no matching entry", async () => {
    const { client } = fakeStorageClient({ listData: [] });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });

  test("reports a path as missing when size or mimetype don't match", async () => {
    const { client } = fakeStorageClient({
      listData: [{ name: "photo.jpg", metadata: { size: 999, mimetype: "image/jpeg" } }],
    });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });

  test("reports a path as missing when the list call itself errors", async () => {
    const { client } = fakeStorageClient({ listError: new Error("network") });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });
});
