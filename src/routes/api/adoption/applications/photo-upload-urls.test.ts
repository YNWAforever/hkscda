import { describe, expect, mock, test } from "bun:test";

type ResourceRoute = {
  options: {
    server?: {
      handlers?: Record<string, unknown>;
    };
  };
};

describe("photo-upload-urls route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./photo-upload-urls");
    const resourceRoute = Route as unknown as ResourceRoute;
    expect(resourceRoute.options.server?.handlers?.POST).toBeDefined();
  });
});

describe("adoption photo upload authorization", () => {
  const body = {
    photos: [{ category: "home", fileName: "home.jpg", mimeType: "image/jpeg", sizeBytes: 10 }],
    turnstileToken: "challenge-token",
  };

  test("rejects an invalid challenge before creating signed URLs", async () => {
    const { createPhotoUploadUrlsHandler } = await import("./photo-upload-urls");
    let clientCreated = false;
    const handler = createPhotoUploadUrlsHandler({
      enforceRateLimit: async () => ({ ok: true }),
      verifyToken: async () => false,
      createClient: () => {
        clientCreated = true;
        return {} as never;
      },
      signUploads: async () => {
        throw new Error("should not sign");
      },
      registerIntent: async () => {
        throw new Error("should not register");
      },
      createTokenPair: () => ({ rawToken: "raw-token", tokenHash: "hash" }),
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const response = await handler(
      new Request("https://example.test/api/adoption/applications/photo-upload-urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(403);
    expect(clientCreated).toBe(false);
  });

  test("stores an intent for the exact signed paths and returns a retry token", async () => {
    const { createPhotoUploadUrlsHandler } = await import("./photo-upload-urls");
    const registrations: unknown[] = [];
    const handler = createPhotoUploadUrlsHandler({
      enforceRateLimit: async () => ({ ok: true }),
      verifyToken: async () => true,
      createClient: () => ({}) as never,
      signUploads: async () => [
        {
          category: "home",
          path: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/home/home.jpg",
          signedUrl: "https://storage.test/upload",
          token: "upload-token",
        },
      ],
      registerIntent: async (_client, input) => {
        registrations.push(input);
        return {} as never;
      },
      createTokenPair: () => ({ rawToken: "raw-status-token", tokenHash: "hashed-status-token" }),
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const response = await handler(
      new Request("https://example.test/api/adoption/applications/photo-upload-urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
    expect(registrations).toEqual([
      {
        applicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        photoPaths: ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/home/home.jpg"],
        statusTokenHash: "hashed-status-token",
      },
    ]);
    expect(await response.json()).toMatchObject({ statusToken: "raw-status-token" });
  });
});
