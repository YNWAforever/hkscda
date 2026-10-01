import { expect, test } from "bun:test";
import { createContentReviewHttp } from "./http.server";
import { createContentReviewRepository } from "./repository.server";
import { createContentReviewService } from "./service";

test("CMS quality filter reaches the repository and rejects animal quality queries", async () => {
  let seen: unknown;
  const service = createContentReviewService({
    review: async () => ({ kind: "reviewed" }),
    list: async (_actor, input) => {
      seen = input;
      return { items: [], total: 0 };
    },
  });
  await service.list("actor", { page: "2", kind: "content", quality: "demo" });
  expect(seen).toEqual({ page: 2, kind: "content", quality: "demo" });
  expect(() => service.list("actor", { page: 1, kind: "animal", quality: "expired" })).toThrow();
  expect(() => service.list("actor", { page: 1, kind: "content", quality: "unknown" })).toThrow();

  const http = createContentReviewHttp({
    authenticate: async () => "actor",
    service,
  });
  const denied = await http(
    new Request("https://example.invalid/api/admin/content-review?kind=animal&quality=demo"),
  );
  expect(denied.status).toBe(400);
  expect(denied.headers.get("cache-control")).toBe("no-store");
});

test("quality lookup uses the restricted RPC while all-items preserves the old read path", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: { items: [], total: 0 }, error: null };
    },
  } as unknown as Parameters<typeof createContentReviewRepository>[0];
  const repo = createContentReviewRepository(client);
  await repo.list("actor", { page: 2, kind: "content", quality: "missing_source" });
  await repo.list("actor", { page: 1, kind: "animal", quality: "all" });
  expect(calls).toEqual([
    {
      name: "editorial_quality_queue",
      args: { p_actor: "actor", p_page: 2, p_quality: "missing_source" },
    },
    {
      name: "editorial_review_queue",
      args: { p_actor: "actor", p_page: 1, p_kind: "animal" },
    },
  ]);
});

test("content-review HTTP reports malformed JSON and an RPC role recheck without masking them", async () => {
  const http = createContentReviewHttp({
    authenticate: async () => "actor",
    service: {
      review: async () => ({ kind: "reviewed" }),
      list: async () => {
        throw { code: "42501", message: "forbidden" };
      },
    },
  });
  const malformed = await http(
    new Request("https://example.invalid/api/admin/content-review", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    }),
  );
  expect(malformed.status).toBe(400);
  const denied = await http(
    new Request("https://example.invalid/api/admin/content-review?quality=demo"),
  );
  expect(denied.status).toBe(403);
  expect(denied.headers.get("cache-control")).toBe("no-store");
});
