import { describe, expect, test } from "bun:test";

type ResourceRoute = {
  options: {
    server?: {
      handlers?: Record<string, unknown>;
    };
  };
};

describe("proof-upload-url route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./proof-upload-url");
    const resourceRoute = Route as unknown as ResourceRoute;
    expect(resourceRoute.options.server?.handlers?.POST).toBeDefined();
  });

  test("signs a proof intent only after Turnstile accepts the upload", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    const order: string[] = [];
    const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";
    const path = pledgeId + "/proof/receipt.jpg";
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: async () => {
        order.push("verify");
        return true;
      },
      createClient: () => ({}) as never,
      randomUUID: () => pledgeId,
      signUploads: async () => {
        order.push("sign");
        return [
          {
            category: "proof",
            path,
            signedUrl: "https://storage.test/upload",
            token: "upload-token",
          },
        ];
      },
      issueIntent: ({ pledgeId: issuedId, path: issuedPath }) => {
        expect({ issuedId, issuedPath }).toEqual({ issuedId: pledgeId, issuedPath: path });
        return "signed-intent";
      },
      now: () => new Date("2026-09-26T00:00:00.000Z"),
      registerIntent: async (_client, intent) => {
        expect(intent).toEqual({
          pledgeId,
          storagePath: path,
          expiresAt: "2026-09-27T00:00:00.000Z",
        });
        order.push("register");
      },
    });
    const response = await handler(
      new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnstileToken: "challenge",
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ pledgeId, proofIntent: "signed-intent" });
    expect(order).toEqual(["verify", "sign", "register"]);
  });

  test("does not return a signed URL when intent registration fails", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: async () => true,
      createClient: () => ({}) as never,
      signUploads: async () => [
        {
          category: "proof",
          path: "pledge/proof/receipt.jpg",
          signedUrl: "https://storage.test/upload",
          token: "upload-token",
        },
      ],
      issueIntent: () => "signed-intent",
      registerIntent: async () => {
        throw new Error("database unavailable");
      },
      logger: { error: () => {} },
    });
    const response = await handler(
      new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnstileToken: "challenge",
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      }),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("upload-token");
  });

  test("does not sign a proof upload when Turnstile rejects the request", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    let signed = false;
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: async () => false,
      signUploads: async () => {
        signed = true;
        return [];
      },
      createClient: () => ({}) as never,
    });
    const response = await handler(
      new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnstileToken: "failed-token",
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(signed).toBe(false);
  });
});
