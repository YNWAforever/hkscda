import { describe, expect, spyOn, test } from "bun:test";

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

describe("COD configuration diagnostics", () => {
  test.each([
    ["Missing required environment variable: COD_ENV", "COD_ENV"],
    ["COD_ENV must be sandbox or production", "COD_ENV"],
    ["Missing required environment variable: COD_MERCHANT_ID", "COD_MERCHANT_ID"],
    ["Missing required environment variable: COD_SEGMENT_ID", "COD_SEGMENT_ID"],
    ["COD AES key must be exactly 16 or 32 bytes", "COD_AES_SECRET_BASE64"],
    ["COD private key must be a valid RSA PEM", "COD_PRIVATE_KEY_BASE64"],
    ["COD notification public key must be a valid RSA PEM", "COD_NOTIFICATION_PUBLIC_KEY_BASE64"],
    ["unexpected secret=DO_NOT_LOG_THIS", null],
  ])("reports only the configuration field for %s", async (message, field) => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    let databaseCreated = false;
    try {
      const response = await handleCodWebhookRequest(request(), {
        enforce: async () => ({ ok: true }) as never,
        getConfig: () => {
          throw new Error(message!);
        },
        createClient: () => {
          databaseCreated = true;
          throw new Error("must not run");
        },
      });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("COD notification processing failed");
      expect(log.mock.calls).toEqual([
        ["COD notification processing failed", { configurationField: field }],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("DO_NOT_LOG_THIS");
      expect(databaseCreated).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
