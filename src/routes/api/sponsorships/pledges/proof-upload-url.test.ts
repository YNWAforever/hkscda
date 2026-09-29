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

  test("normalizes legacy null and omitted tokens for local disabled verification", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    const { verifyTurnstile } = await import("../../../../lib/security/turnstile.server");
    let signed = 0;
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: (token, ip) => verifyTurnstile(token, ip, { secret: "", isProduction: false }),
      createClient: () => ({}) as never,
      signUploads: async () => {
        signed += 1;
        return [
          {
            category: "proof",
            path: "pledge/proof/receipt.jpg",
            signedUrl: "https://storage.test/upload",
            token: "upload-token",
          },
        ];
      },
      issueIntent: () => "signed-intent",
      registerIntent: async () => {},
    });
    for (const tokenField of [{}, { turnstileToken: null }]) {
      const response = await handler(
        new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...tokenField,
            proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
          }),
        }),
      );
      expect(response.status).toBe(201);
    }
    expect(signed).toBe(2);
  });

  test("rejects absent tokens in production and configured challenge mode before signing", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    const { verifyTurnstile } = await import("../../../../lib/security/turnstile.server");
    let signed = 0;
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: (token, ip) => verifyTurnstile(token, ip, { secret: "", isProduction: true }),
      createClient: () => ({}) as never,
      signUploads: async () => {
        signed += 1;
        return [];
      },
    });
    const response = await handler(
      new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(signed).toBe(0);
    expect(
      await verifyTurnstile(undefined, undefined, { secret: "configured", isProduction: false }),
    ).toBe(false);
  });

  test("only signs once for a consumed configured challenge token", async () => {
    const { createProofUploadUrlHandler } = await import("./proof-upload-url");
    let checked = 0;
    let signed = 0;
    const handler = createProofUploadUrlHandler({
      rateLimit: async () => ({ ok: true }),
      verify: async (token) => token === "single-use" && ++checked === 1,
      createClient: () => ({}) as never,
      signUploads: async () => {
        signed += 1;
        return [
          {
            category: "proof",
            path: "pledge/proof/receipt.jpg",
            signedUrl: "https://storage.test/upload",
            token: "upload-token",
          },
        ];
      },
      issueIntent: () => "signed-intent",
      registerIntent: async () => {},
    });
    const request = () =>
      new Request("https://example.test/api/sponsorships/pledges/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnstileToken: "single-use",
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      });
    expect((await handler(request())).status).toBe(201);
    expect((await handler(request())).status).toBe(403);
    expect(signed).toBe(1);
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
