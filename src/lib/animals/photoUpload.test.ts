import { describe, expect, test } from "bun:test";

import {
  ANIMAL_IMAGE_MAX_BYTES,
  animalPhotoDescriptorSchema,
  animalPhotoPath,
  safeAnimalFileName,
} from "./photoUpload";
import { createAnimalPhotoUploadHandlers } from "./photoUpload.http.server";

const animalId = "11111111-2222-4333-8444-555555555555";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/animals/photo-upload-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function handlers(overrides: Partial<Parameters<typeof createAnimalPhotoUploadHandlers>[0]> = {}) {
  const issued: string[] = [];
  const base = createAnimalPhotoUploadHandlers({
    requireAnimalAdmin: async () => ({ role: "staff" }),
    createSignedUpload: async (_bucket, path) => {
      issued.push(path);
      return { path, signedUrl: `https://storage.test/${path}`, token: "tok" };
    },
    newVersion: () => "version-1",
    ...overrides,
  });
  return { ...base, issued };
}

describe("animalPhotoPath", () => {
  test("puts every upload on a new immutable path under the animal", () => {
    // The defect this closes: the old code wrote every photo to
    // `${animalId}.jpg` with upsert:true, so a replacement destroyed the
    // previous photograph and a failed save left nothing to restore.
    const first = animalPhotoPath({ animalId, version: "v1", fileName: "cici.jpg" });
    const second = animalPhotoPath({ animalId, version: "v2", fileName: "cici.jpg" });

    expect(first).toBe(`${animalId}/v1/cici.jpg`);
    expect(second).toBe(`${animalId}/v2/cici.jpg`);
    expect(first).not.toBe(second);
    // Never the legacy fixed path.
    expect(first).not.toBe(`${animalId}.jpg`);
  });

  test("cannot be steered out of the animal's folder by the file name", () => {
    expect(animalPhotoPath({ animalId, version: "v1", fileName: "../../secret.jpg" })).toBe(
      `${animalId}/v1/secret.jpg`,
    );
    expect(animalPhotoPath({ animalId, version: "v1", fileName: "a/b/c.jpg" })).toBe(
      `${animalId}/v1/c.jpg`,
    );
  });

  test("collapses dot-only and empty names to the fallback", () => {
    expect(safeAnimalFileName("..")).toBe("photo.jpg");
    expect(safeAnimalFileName("   ")).toBe("photo.jpg");
  });
});

describe("animalPhotoDescriptorSchema", () => {
  test("accepts the bucket's allowed types", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() =>
        animalPhotoDescriptorSchema.parse({ fileName: "a.jpg", mimeType, sizeBytes: 1024 }),
      ).not.toThrow();
    }
  });

  test("rejects a type the bucket would refuse, and an oversized file", () => {
    expect(() =>
      animalPhotoDescriptorSchema.parse({
        fileName: "a.gif",
        mimeType: "image/gif",
        sizeBytes: 1024,
      }),
    ).toThrow();
    expect(() =>
      animalPhotoDescriptorSchema.parse({
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: ANIMAL_IMAGE_MAX_BYTES + 1,
      }),
    ).toThrow();
  });
});

describe("POST /api/admin/animals/photo-upload-url", () => {
  test("rejects JSON null without throwing or signing an upload", async () => {
    const h = handlers();
    const response = await h.createUploadUrl({ request: request(null) });
    expect(response.status).toBe(400);
    expect(h.issued).toEqual([]);
  });
  test("refuses an unauthenticated caller before issuing anything", async () => {
    const h = handlers({
      requireAnimalAdmin: async () => {
        throw new Error("no admin session");
      },
    });

    const response = await h.createUploadUrl({
      request: request({
        animalId,
        photo: { fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10 },
      }),
    });

    expect(response.status).toBe(401);
    // No signed URL was minted for an unauthorised request.
    expect(h.issued).toEqual([]);
  });

  test("issues a signed URL for a fresh path", async () => {
    const h = handlers();
    const response = await h.createUploadUrl({
      request: request({
        animalId,
        photo: { fileName: "cici.jpg", mimeType: "image/jpeg", sizeBytes: 2048 },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      bucket: "animal-images",
      path: `${animalId}/version-1/cici.jpg`,
      token: "tok",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects an animalId that is not a UUID", async () => {
    // The id becomes the first path segment; anything else would let a caller
    // choose where the object lands.
    const h = handlers();
    const response = await h.createUploadUrl({
      request: request({
        animalId: "../../../etc",
        photo: { fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10 },
      }),
    });

    expect(response.status).toBe(400);
    expect(h.issued).toEqual([]);
  });

  test("rejects an unsupported photo without revealing the validation internals", async () => {
    const h = handlers();
    const response = await h.createUploadUrl({
      request: request({
        animalId,
        photo: { fileName: "a.gif", mimeType: "image/gif", sizeBytes: 10 },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported photo. Use a JPEG, PNG or WebP image under 8 MB.",
    });
    expect(h.issued).toEqual([]);
  });

  test("rejects a malformed body rather than throwing", async () => {
    const h = handlers();
    const response = await h.createUploadUrl({
      request: new Request("http://localhost/api/admin/animals/photo-upload-url", {
        method: "POST",
        body: "not json",
      }),
    });

    expect(response.status).toBe(400);
    expect(h.issued).toEqual([]);
  });
});
