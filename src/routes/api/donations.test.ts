import { describe, expect, spyOn, test } from "bun:test";

import { Route } from "./donations";

type DonationRoute = {
  options: {
    server?: {
      handlers?: {
        POST?: (context: { request: Request }) => Promise<Response>;
      };
    };
  };
};

describe("public donation request validation", () => {
  test("rejects an oversized body before verification or checkout", async () => {
    const handler = (Route as unknown as DonationRoute).options.server?.handlers?.POST;
    expect(handler).toBeDefined();
    if (!handler) throw new Error("missing donation POST handler");
    const request = new Request("https://example.test/api/donations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(request.headers.has("content-length")).toBe(false);
    const response = await handler({ request });
    expect(response.status).toBe(413);
  });
  test.each(["{", "null"])("rejects invalid JSON body %s with 400", async (body) => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const handler = (Route as unknown as DonationRoute).options.server?.handlers?.POST;
      expect(handler).toBeDefined();
      if (!handler) throw new Error("missing donation POST handler");
      const response = await handler({
        request: new Request("https://example.test/api/donations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      });
      expect(response.status).toBe(400);
    } finally {
      log.mockRestore();
    }
  });
});
