import { expect, test } from "bun:test";
import { createContentReviewService } from "./service";
import { createContentReviewHttp } from "./http.server";
const id = "00000000-0000-4000-8000-000000000001";
test("review requires explicit classification and source evidence, preserves actor and revision", async () => {
  let saved: unknown;
  const service = createContentReviewService({
    review: async (actor, input) => {
      saved = { actor, input };
      return { kind: "reviewed" };
    },
    list: async () => ({ items: [], total: 0 }),
  });
  const input = {
    entity_kind: "animal",
    entity_id: id,
    revision_key: "12",
    classification: "approved",
    evidence: "Verified original rescue intake record",
  };
  await service.review(id, input);
  expect(saved).toEqual({ actor: id, input });
  expect(() => service.review(id, { ...input, evidence: " " })).toThrow();
  expect(() => service.review(id, { ...input, classification: undefined })).toThrow();
  expect(() => service.review(id, { ...input, actor: "forged" })).toThrow();
});
test("review authorization is checked before reading or mutating and stale state is HTTP409", async () => {
  let calls = 0;
  const service = createContentReviewService({
    review: async () => {
      calls++;
      return { kind: "conflict" };
    },
    list: async () => {
      calls++;
      return { items: [], total: 0 };
    },
  });
  const denied = createContentReviewHttp({
    service,
    authenticate: async () => {
      throw new Response(null, { status: 403 });
    },
  });
  expect((await denied(new Request("http://local/api/admin/content-review"))).status).toBe(403);
  expect(calls).toBe(0);
  const handle = createContentReviewHttp({ service, authenticate: async () => id });
  const result = await handle(
    new Request("http://local/api/admin/content-review", {
      method: "POST",
      body: JSON.stringify({
        entity_kind: "content",
        entity_id: id,
        revision_key: id,
        classification: "demo",
        evidence: "Repository demo fixture exact ID",
      }),
    }),
  );
  expect(result.status).toBe(409);
  expect(result.headers.get("cache-control")).toBe("no-store");
});
