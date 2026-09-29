import { expect, test } from "bun:test";
import { createCrmTagBulkHandler } from "./tag-bulk";

const url = "https://example.invalid/api/admin/supporters/tag-bulk";
const actor = "11111111-1111-4111-8111-111111111111";
const item = "22222222-2222-4222-8222-222222222222";
const op = "33333333-3333-4333-8333-333333333333";

test("CRM bulk API requires current treasurer and bounds preview to 1000 IDs", async () => {
  const seen: string[] = [];
  const handle = createCrmTagBulkHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization"))
        throw new Response("Unauthorized", { status: 401 });
      return actor;
    },
    preview: async () => {
      seen.push("preview");
      return {
        operationId: op,
        tag: "reviewed",
        filterHash: "a".repeat(64),
        createdAt: "2026-09-27",
        expiresAt: "2026-09-28",
        state: "queued" as const,
        items: [
          {
            entityId: item,
            status: "pending" as const,
            reasonCode: null,
            beforeTags: [],
            afterTags: ["reviewed"],
            expectedVersion: 1,
          },
        ],
      };
    },
    read: async () => {
      seen.push("read");
      return {
        operationId: op,
        tag: "reviewed",
        filterHash: "a".repeat(64),
        createdAt: "2026-09-27",
        expiresAt: "2026-09-28",
        state: "queued" as const,
        items: [
          {
            entityId: item,
            status: "pending" as const,
            reasonCode: null,
            beforeTags: [],
            afterTags: ["reviewed"],
            expectedVersion: 1,
          },
        ],
      };
    },
    applyItem: async () => {
      seen.push("apply");
      return { entityId: item, status: "succeeded" as const, reasonCode: null };
    },
  });
  const body = JSON.stringify({
    action: "preview",
    ids: [item],
    tag: "reviewed",
    filterHash: "a".repeat(64),
  });
  expect(
    (
      await handle(
        new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
      )
    ).status,
  ).toBe(401);
  const oversized = JSON.stringify({
    action: "preview",
    ids: Array.from({ length: 1001 }, () => item),
    tag: "reviewed",
    filterHash: "a".repeat(64),
  });
  expect(
    (
      await handle(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer good" },
          body: oversized,
        }),
      )
    ).status,
  ).toBe(400);
  expect(seen).toEqual([]);
  const preview = await handle(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer good" },
      body,
    }),
  );
  expect(preview.status).toBe(200);
  expect(preview.headers.get("cache-control")).toBe("no-store");
  expect(seen).toEqual(["preview"]);
});

test("apply reads stored snapshot and invokes per-item guarded command", async () => {
  const seen: string[] = [];
  const operation = {
    operationId: op,
    tag: "reviewed",
    filterHash: "a".repeat(64),
    createdAt: "2026-09-27",
    expiresAt: "2026-09-28",
    state: "queued" as const,
    items: [
      {
        entityId: item,
        status: "pending" as const,
        reasonCode: null,
        beforeTags: [],
        afterTags: ["reviewed"],
        expectedVersion: 1,
      },
    ],
  };
  const handle = createCrmTagBulkHandler({
    authorize: async () => actor,
    preview: async () => operation,
    read: async () => {
      seen.push("read");
      return operation;
    },
    applyItem: async (_actor, _op, id) => {
      seen.push(id);
      return { entityId: id, status: "succeeded" as const, reasonCode: null };
    },
  });
  const response = await handle(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "apply", operationId: op }),
    }),
  );
  expect(response.status).toBe(200);
  expect(seen).toEqual(["read", item, "read"]);
});

test("apply checkpoints at 25 items and resumes only pending rows after an HTTP retry", async () => {
  const ids = Array.from(
    { length: 30 },
    (_, index) => `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
  );
  const status = new Map(ids.map((id) => [id, "pending" as "pending" | "succeeded"]));
  const applied: string[] = [];
  const operation = () => ({
    operationId: op,
    tag: "reviewed",
    filterHash: "a".repeat(64),
    createdAt: "2026-09-27",
    expiresAt: "2099-09-28",
    state: "partial" as const,
    items: ids.map((id) => ({
      entityId: id,
      status: status.get(id)!,
      reasonCode: null,
      beforeTags: [],
      afterTags: ["reviewed"],
      expectedVersion: 1,
    })),
  });
  const handle = createCrmTagBulkHandler({
    authorize: async () => actor,
    preview: async () => operation(),
    read: async () => operation(),
    applyItem: async (_actor, _operation, id) => {
      applied.push(id);
      status.set(id, "succeeded");
      return { entityId: id, status: "succeeded" as const, reasonCode: null };
    },
  });
  const command = () =>
    handle(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: op }),
      }),
    );
  expect((await command()).status).toBe(200);
  expect(applied).toHaveLength(25);
  expect((await command()).status).toBe(200);
  expect(applied).toHaveLength(30);
  expect((await command()).status).toBe(200);
  expect(applied).toHaveLength(30);
});

test("malformed CRM bulk JSON is a client error without mutation", async () => {
  let calls = 0;
  const unexpected = async (): Promise<never> => {
    calls++;
    throw new Error("unexpected mutation");
  };
  const handle = createCrmTagBulkHandler({
    authorize: async () => actor,
    preview: unexpected,
    read: unexpected,
    applyItem: unexpected,
  });
  const response = await handle(new Request(url, { method: "POST", body: "{broken" }));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toBe(0);
});
