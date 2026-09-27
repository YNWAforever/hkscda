import { expect, test } from "bun:test";
import { createCmsReviewBulkHandler, type CmsReviewBulkOperation } from "./review-bulk";

const url = "https://example.invalid/api/admin/content/review-bulk";
const actor = "11111111-1111-4111-8111-111111111111";
const evidence = "Synthetic source review";
const op = "33333333-3333-4333-8333-333333333333";
const ids = Array.from(
  { length: 30 },
  (_, index) => `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
);

test("CMS review bulk API refuses unauthenticated and oversized previews", async () => {
  const calls: string[] = [];
  const operation: CmsReviewBulkOperation = {
    operationId: op,
    evidence,
    filterHash: "a".repeat(64),
    createdAt: "2026-09-27",
    expiresAt: "2099-09-28",
    state: "queued",
    items: [],
  };
  const handle = createCmsReviewBulkHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization"))
        throw new Response("Unauthorized", { status: 401 });
      return actor;
    },
    preview: async () => {
      calls.push("preview");
      return operation;
    },
    read: async () => operation,
    applyItem: async () => ({ entityId: ids[0]!, status: "succeeded", reasonCode: null }),
  });
  const post = (selected: string[], authenticated = true) =>
    handle(
      new Request(url, {
        method: "POST",
        headers: authenticated ? { authorization: "Bearer synthetic" } : {},
        body: JSON.stringify({
          action: "preview",
          ids: selected,
          evidence,
          filterHash: "a".repeat(64),
        }),
      }),
    );
  expect((await post([ids[0]!], false)).status).toBe(401);
  expect((await post(Array.from({ length: 1001 }, () => ids[0]!))).status).toBe(400);
  expect(calls).toEqual([]);
  const result = await post([ids[0]!]);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual(["preview"]);
});

test("CMS review bulk API checkpoints at 25 and resumes pending items", async () => {
  const state = new Map(ids.map((id) => [id, "pending" as "pending" | "succeeded"]));
  const calls: string[] = [];
  const operation = (): CmsReviewBulkOperation => ({
    operationId: op,
    evidence,
    filterHash: "a".repeat(64),
    createdAt: "2026-09-27",
    expiresAt: "2099-09-28",
    state: "partial",
    items: ids.map((id) => ({
      entityId: id,
      status: state.get(id)!,
      reasonCode: null,
      beforeClassification: null,
      afterClassification: "needs_review",
      expectedRevision: "11111111-1111-4111-8111-111111111111",
    })),
  });
  const handle = createCmsReviewBulkHandler({
    authorize: async () => actor,
    preview: async () => operation(),
    read: async () => operation(),
    applyItem: async (_actor, _operation, id) => {
      calls.push(id);
      state.set(id, "succeeded");
      return { entityId: id, status: "succeeded", reasonCode: null };
    },
  });
  const apply = () =>
    handle(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: op }),
      }),
    );
  expect((await apply()).status).toBe(200);
  expect(calls).toHaveLength(25);
  expect((await apply()).status).toBe(200);
  expect(calls).toHaveLength(30);
  expect((await apply()).status).toBe(200);
  expect(calls).toHaveLength(30);
});
