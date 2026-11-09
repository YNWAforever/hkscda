import { expect, test } from "bun:test";

import { createAdminKnowledgeHandlers } from "./http";

test("knowledge publication conflicts return 409 without exposing database details", async () => {
  const handlers = createAdminKnowledgeHandlers({
    requireKnowledgeAdmin: async () => ({ authUserId: crypto.randomUUID() }) as never,
    service: {
      listAdmin: async () => ({ posts: [], page: 1, pageSize: 25, total: 0 }),
      upsert: async () => {
        throw Object.assign(new Error("internal PDF asset detail"), { code: "23514" });
      },
      remove: async () => undefined,
    },
  });

  const response = await handlers.upsert({
    request: new Request("https://example.test/api/admin/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "Knowledge post conflicts with document publication state",
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("a stale expectedRevision is the coded 409 the knowledge editor reloads on", async () => {
  const handlers = createAdminKnowledgeHandlers({
    requireKnowledgeAdmin: async () => ({ authUserId: crypto.randomUUID() }) as never,
    service: {
      listAdmin: async () => ({ posts: [], page: 1, pageSize: 25, total: 0 }),
      upsert: async () => {
        throw Object.assign(new Error("Knowledge post changed since it was loaded"), {
          code: "40001",
        });
      },
      remove: async () => undefined,
    },
  });

  const response = await handlers.upsert({
    request: new Request("https://example.test/api/admin/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 2, title: "t" }),
    }),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { code: "conflict", message: "Knowledge post changed; reload before saving" },
  });
});
