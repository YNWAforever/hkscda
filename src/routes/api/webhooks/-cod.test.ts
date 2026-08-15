import { describe, expect, test } from "bun:test";

import { CodNotificationError } from "../../../lib/donations/cod-webhook.server";
import { handleCodWebhookRequest } from "./cod";

const request = () =>
  new Request("https://hkscda.example/api/webhooks/cod", {
    method: "POST",
    body: JSON.stringify({ data: "{}", signature: "c2ln", algorithm: "rsa-sha256" }),
    headers: { "content-type": "application/json" },
  });

describe("COD webhook response contract", () => {
  test("is registered in the generated server route tree", async () => {
    const routeTree = await Bun.file(new URL("../../../routeTree.gen.ts", import.meta.url)).text();
    expect(routeTree).toContain("./routes/api/webhooks/cod");
    expect(routeTree).toContain("'/api/webhooks/cod'");
  });

  test.each(["applied", "duplicate", "not_found", "manual_review"])(
    "acknowledges %s as exact plain success",
    async (kind) => {
      const response = await handleCodWebhookRequest(request(), {
        enforce: async () => ({ ok: true }) as never,
        process: async () => ({ kind }) as never,
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("success");
    },
  );

  test("returns non-success for malformed or unauthenticated envelopes", async () => {
    const response = await handleCodWebhookRequest(request(), {
      enforce: async () => ({ ok: true }) as never,
      process: async () => {
        throw new CodNotificationError("invalid_signature");
      },
    });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toBe("success");
  });

  test("returns 500 for transient database or internal failures", async () => {
    const response = await handleCodWebhookRequest(request(), {
      enforce: async () => ({ ok: true }) as never,
      process: async () => {
        throw new Error("database unavailable");
      },
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toBe("success");
  });
});
