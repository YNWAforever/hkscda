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
  const fromMock = mock((_bucket: string) => fromResult);
  const client = {
    storage: {
      from: fromMock,
    },
  } as never;
  return { client, fromResult, fromMock };
}

describe("createSignedUploadUrls", () => {
  test("builds a path per descriptor and returns the signed URL data", async () => {
    const { client, fromMock } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    });
    const results = await createSignedUploadUrls(client, "adoption-application-photos", "draft-1", [
      { category: "home", fileName: "photo.jpg" },
    ]);
    expect(results).toEqual([
      { category: "home", path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("adoption-application-photos");
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

  test("falls back to a safe name when the file name is only dots", async () => {
    const { client, fromResult } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/file", signedUrl: "u", token: "t" },
    });
    await createSignedUploadUrls(client, "bucket", "draft-1", [
      { category: "home", fileName: ".." },
    ]);
    expect(fromResult.createSignedUploadUrl).toHaveBeenCalledWith("draft-1/home/file");
  });

  test("throws when the signed URL request errors", async () => {
    const { client } = fakeStorageClient({ signedUrlError: new Error("boom") });
    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [
        { category: "home", fileName: "a.jpg" },
      ]),
    ).rejects.toThrow("boom");
  });

  test("mints a distinct, correctly ordered path per descriptor for multiple items", async () => {
    const { client, fromResult } = fakeStorageClient();
    fromResult.createSignedUploadUrl
      .mockImplementationOnce(async () => ({
        data: { path: "draft-1/home/first.jpg", signedUrl: "https://x/1", token: "tok-1" },
        error: null,
      }))
      .mockImplementationOnce(async () => ({
        data: { path: "draft-1/vet/second.jpg", signedUrl: "https://x/2", token: "tok-2" },
        error: null,
      }));

    const results = await createSignedUploadUrls(client, "bucket", "draft-1", [
      { category: "home", fileName: "first.jpg" },
      { category: "vet", fileName: "second.jpg" },
    ]);

    expect(results).toEqual([
      {
        category: "home",
        path: "draft-1/home/first.jpg",
        signedUrl: "https://x/1",
        token: "tok-1",
      },
      { category: "vet", path: "draft-1/vet/second.jpg", signedUrl: "https://x/2", token: "tok-2" },
    ]);
    expect(fromResult.createSignedUploadUrl).toHaveBeenNthCalledWith(1, "draft-1/home/first.jpg");
    expect(fromResult.createSignedUploadUrl).toHaveBeenNthCalledWith(2, "draft-1/vet/second.jpg");
  });

  test("rejects and doesn't return partial results when a later descriptor's request errors", async () => {
    const { client, fromResult } = fakeStorageClient();
    fromResult.createSignedUploadUrl
      .mockImplementationOnce(async () => ({
        data: { path: "draft-1/home/first.jpg", signedUrl: "https://x/1", token: "tok-1" },
        error: null,
      }))
      .mockImplementationOnce(async () => ({
        data: null,
        error: new Error("second upload failed"),
      }));

    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [
        { category: "home", fileName: "first.jpg" },
        { category: "vet", fileName: "second.jpg" },
      ]),
    ).rejects.toThrow("second upload failed");
  });

  test("throws before minting any signed URLs when two descriptors collide on the same path", async () => {
    const { client, fromResult } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/photo.jpg", signedUrl: "u", token: "t" },
    });

    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [
        { category: "home", fileName: "photo.jpg" },
        { category: "home", fileName: "photo.jpg" },
      ]),
    ).rejects.toThrow("Duplicate upload path: draft-1/home/photo.jpg");
    expect(fromResult.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  test("throws when two different original filenames sanitize to the same path", async () => {
    const { client } = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/photo.jpg", signedUrl: "u", token: "t" },
    });

    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [
        { category: "home", fileName: "photo!.jpg" },
        { category: "home", fileName: "photo@.jpg" },
      ]),
    ).rejects.toThrow("Duplicate upload path: draft-1/home/photo_.jpg");
  });
});

describe("verifyUploadedObjects", () => {
  test("returns ok when every object exists with matching metadata", async () => {
    const { client, fromMock } = fakeStorageClient({
      listData: [{ name: "photo.jpg", metadata: { size: 100, mimetype: "image/jpeg" } }],
    });
    const result = await verifyUploadedObjects(client, "adoption-application-photos", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("adoption-application-photos");
  });

  test("checks each expected object independently so only the truly missing one is reported", async () => {
    const { client, fromResult } = fakeStorageClient();
    fromResult.list
      .mockImplementationOnce(async () => ({
        data: [{ name: "photo.jpg", metadata: { size: 100, mimetype: "image/jpeg" } }],
        error: null,
      }))
      .mockImplementationOnce(async () => ({ data: [], error: null }));

    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
      { category: "vet", path: "draft-1/vet/missing.jpg", sizeBytes: 50, mimeType: "image/png" },
    ]);

    expect(result).toEqual({ ok: false, missing: ["draft-1/vet/missing.jpg"] });
    expect(fromResult.list).toHaveBeenNthCalledWith(1, "draft-1/home", { search: "photo.jpg" });
    expect(fromResult.list).toHaveBeenNthCalledWith(2, "draft-1/vet", { search: "missing.jpg" });
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
