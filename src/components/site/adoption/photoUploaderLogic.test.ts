import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { AdoptionPhotoCategory } from "../../../lib/publicAdoption/schemas";
import type { SelectedPhoto } from "./photoUploaderLogic";

// `mock.module` mocks are process-global in Bun's test runner and outlive this
// file: they aren't undone by `mock.restore()`, so an unmocked-back specifier
// here would leak into every other test file (in the same `bun test` run)
// that imports "../../../lib/supabase" after this one. Capture the real
// module first so `afterAll` can put it back.
// Spread into a plain object: `mock.module` mutates the shared
// module-registry exports object in place, so a bare reference captured here
// would be mutated out from under us the moment the mock below is installed.
const realSupabaseModule = { ...(await import("../../../lib/supabase")) };

const uploadToSignedUrl = mock(
  async (
    _path: string,
    _token: string,
    _file: File,
    _options: { contentType: string },
  ): Promise<{ data: unknown; error: unknown }> => ({ data: { path: _path }, error: null }),
);
const storageFrom = mock((_bucket: string) => ({ uploadToSignedUrl }));
const getSupabaseClient = mock(() => ({ storage: { from: storageFrom } }));

mock.module("../../../lib/supabase", () => ({ getSupabaseClient }));

const { uploadPhotoDirectly, requestPhotoUploadUrls, uploadAllPhotos } =
  await import("./photoUploaderLogic");

afterAll(() => {
  mock.module("../../../lib/supabase", () => realSupabaseModule);
});

function makePhoto(category: AdoptionPhotoCategory, fileName = "photo.jpg"): SelectedPhoto {
  return {
    id: `${category}:${fileName}`,
    category,
    file: new File(["bytes"], fileName, { type: "image/jpeg" }),
    status: "idle",
  };
}

describe("uploadPhotoDirectly", () => {
  beforeEach(() => {
    uploadToSignedUrl.mockClear();
    storageFrom.mockClear();
    getSupabaseClient.mockClear();
  });

  test("uploads the file to the signed URL and returns the storage path on success", async () => {
    const photo = makePhoto("home", "living-room.jpg");

    const result = await uploadPhotoDirectly(photo, "application-1", {
      path: "application-1/home/living-room.jpg",
      token: "signed-token",
    });

    expect(result).toEqual({ ok: true, storagePath: "application-1/home/living-room.jpg" });
    expect(storageFrom).toHaveBeenCalledWith("adoption-application-photos");
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "application-1/home/living-room.jpg",
      "signed-token",
      photo.file,
      { contentType: "image/jpeg" },
    );
  });

  test("returns ok:false with a friendly message when the storage upload errors", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("storage boom") });
    const photo = makePhoto("window");

    const result = await uploadPhotoDirectly(photo, "application-1", {
      path: "application-1/window/photo.jpg",
      token: "signed-token",
    });

    expect(result).toEqual({ ok: false, message: "上傳失敗，請重試。" });
  });
});

describe("requestPhotoUploadUrls", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("posts JSON describing each selected photo and returns the parsed response", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          applicationId: "application-1",
          uploads: [
            {
              category: "home",
              path: "application-1/home/a.jpg",
              signedUrl: "https://x",
              token: "t",
            },
          ],
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const photos = [makePhoto("home", "a.jpg")];

    const result = await requestPhotoUploadUrls(photos, "turnstile-token");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/adoption/applications/photo-upload-urls",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnstileToken: "turnstile-token",
          photos: [{ category: "home", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 5 }],
        }),
      }),
    );
    expect(result).toEqual({
      applicationId: "application-1",
      uploads: [
        { category: "home", path: "application-1/home/a.jpg", signedUrl: "https://x", token: "t" },
      ],
    });
  });

  test("throws using the server's error message when the response is not ok", async () => {
    const fetchSpy = mock(async () => Response.json({ error: "驗證已過期" }, { status: 403 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(requestPhotoUploadUrls([makePhoto("home")], null)).rejects.toThrow("驗證已過期");
  });

  test("falls back to a generic message when the error response has no usable body", async () => {
    const fetchSpy = mock(async () => new Response("not json", { status: 500 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(requestPhotoUploadUrls([makePhoto("home")], null)).rejects.toThrow(
      "無法準備相片上傳。",
    );
  });
});

describe("uploadAllPhotos", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    uploadToSignedUrl.mockClear();
    storageFrom.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requests signed URLs then uploads every photo, combining the results", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          applicationId: "application-1",
          uploads: [
            {
              category: "home",
              path: "application-1/home/a.jpg",
              signedUrl: "https://x/1",
              token: "t1",
            },
            {
              category: "window",
              path: "application-1/window/b.jpg",
              signedUrl: "https://x/2",
              token: "t2",
            },
          ],
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const photos = [makePhoto("home", "a.jpg"), makePhoto("window", "b.jpg")];
    const result = await uploadAllPhotos(photos, "turnstile-token");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(uploadToSignedUrl).toHaveBeenNthCalledWith(
      1,
      "application-1/home/a.jpg",
      "t1",
      photos[0]!.file,
      { contentType: "image/jpeg" },
    );
    expect(uploadToSignedUrl).toHaveBeenNthCalledWith(
      2,
      "application-1/window/b.jpg",
      "t2",
      photos[1]!.file,
      { contentType: "image/jpeg" },
    );
    expect(result).toEqual({
      applicationId: "application-1",
      uploaded: [
        {
          category: "home",
          fileName: "a.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 5,
          storagePath: "application-1/home/a.jpg",
        },
        {
          category: "window",
          fileName: "b.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 5,
          storagePath: "application-1/window/b.jpg",
        },
      ],
    });
  });

  test("throws when a signed URL is missing for a requested category", async () => {
    const fetchSpy = mock(async () =>
      Response.json({ applicationId: "application-1", uploads: [] }, { status: 201 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(uploadAllPhotos([makePhoto("living")], null)).rejects.toThrow(
      "Missing signed upload URL for living",
    );
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  test("throws when a photo's direct upload fails and does not upload subsequent photos", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          applicationId: "application-1",
          uploads: [
            {
              category: "home",
              path: "application-1/home/a.jpg",
              signedUrl: "https://x/1",
              token: "t1",
            },
            {
              category: "window",
              path: "application-1/window/b.jpg",
              signedUrl: "https://x/2",
              token: "t2",
            },
          ],
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("boom") });

    const photos = [makePhoto("home", "a.jpg"), makePhoto("window", "b.jpg")];

    await expect(uploadAllPhotos(photos, null)).rejects.toThrow("上傳失敗，請重試。");
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
  });
});
