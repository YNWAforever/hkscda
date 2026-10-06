import { expect, test } from "bun:test";
import { createAdminKnowledgeHandlers } from "./http";
import { z } from "zod";

test("actual knowledge handler maps actor refusal to safe 403", async () => {
  const handlers = createAdminKnowledgeHandlers({
    requireKnowledgeAdmin: async () => ({ authUserId: crypto.randomUUID() }) as never,
    service: {
      upsert: async () => {
        throw { code: "42501", message: "internal PDF diagnostic" };
      },
    } as never,
  });
  const response = await handlers.upsert({
    request: new Request("https://example.invalid/api/admin/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Forbidden" });
});

const invalid = z.string().uuid().safeParse("invalid");
if (invalid.success) throw new Error("Expected invalid fixture");
for (const [name, error, status] of [
  ["Response", new Response("Unauthorized", { status: 401 }), 401],
  ["Zod", invalid.error, 400],
  ["missing", { code: "P0002", message: "internal diagnostic" }, 404],
  ["publication conflict", { code: "23514", message: "internal diagnostic" }, 409],
  ["unknown SQLSTATE", { code: "XX000", message: "internal diagnostic" }, 500],
  ["non-object matching text", "42501", 500],
] as const)
  test(`knowledge permission mapping preserves ${name}`, async () => {
    const handlers = createAdminKnowledgeHandlers({
      requireKnowledgeAdmin: async () => ({ authUserId: crypto.randomUUID() }) as never,
      service: {
        upsert: async () => {
          throw error;
        },
      } as never,
    });
    const response = await handlers.upsert({
      request: new Request("https://example.invalid/api/admin/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    });
    expect(response.status).toBe(status);
    if (!(error instanceof Response)) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("internal diagnostic");
    }
  });
