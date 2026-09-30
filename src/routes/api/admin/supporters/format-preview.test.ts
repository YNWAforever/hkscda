import { expect, test } from "bun:test";

import { createCrmContactFormatPreviewHandler } from "./format-preview";

const url = "https://example.invalid/api/admin/supporters/format-preview";
const first = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const request = (ids: string[], authorization = "Bearer staff") =>
  new Request(url, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ ids, filterHash: hash }),
  });

test("CRM format preview denies direct unauthorized access before reading PII", async () => {
  let reads = 0;
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    loadRows: async () => {
      reads += 1;
      return [];
    },
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  const response = await handle(request([first]));
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(reads).toBe(0);
  expect(await response.text()).not.toContain("Forbidden");
});

test("CRM format preview validates a bounded unique selection and never accepts GET", async () => {
  let reads = 0;
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async () => undefined,
    loadRows: async () => {
      reads += 1;
      return [];
    },
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  expect((await handle(new Request(url, { method: "GET" }))).status).toBe(405);
  expect((await handle(request([first, first]))).status).toBe(400);
  const overLimit = Array.from(
    { length: 1001 },
    (_, index) => `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
  );
  expect((await handle(request(overLimit))).status).toBe(400);
  expect(reads).toBe(0);
});

test("CRM format preview returns current selected rows and explicit missing results without writes", async () => {
  const selected = Array.from(
    { length: 25 },
    (_, index) => `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
  );
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async (input) => {
      if (!input.headers.get("authorization")) throw new Response(null, { status: 401 });
    },
    loadRows: async (ids) => {
      expect(ids).toEqual(selected);
      return [
        {
          id: selected[0]!,
          name: "  Ada  Wong ",
          email: "ada@example.com",
          phone: " 9123  4567 ",
          updatedAt: "2026-09-28T00:00:00Z",
          deletedAt: null,
        },
      ];
    },
    now: () => new Date("2026-09-28T01:00:00Z"),
  });
  expect((await handle(request(selected, ""))).status).toBe(401);
  const response = await handle(request(selected));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.filterHash).toBe(hash);
  expect(body.generatedAt).toBe("2026-09-28T01:00:00.000Z");
  expect(body.items).toHaveLength(25);
  expect(body.items[0]).toMatchObject({
    entityId: selected[0],
    status: "suggested",
    after: { name: "Ada Wong", phone: "9123 4567" },
  });
  expect(body.items[24]).toMatchObject({
    entityId: selected[24],
    status: "skipped",
    reasonCode: "missing_or_deleted",
    before: null,
    after: null,
  });
  expect(body.counts).toEqual({ suggested: 1, manual_review: 0, unchanged: 0, skipped: 24 });
});

test("CRM format preview sanitizes a repository failure", async () => {
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async () => undefined,
    loadRows: async () => {
      throw new Error("internal supporter query detail");
    },
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  const response = await handle(request([first]));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("internal supporter query detail");
});
test("CRM format preview accepts the full 1000-row snapshot without truncation", async () => {
  const ids = Array.from(
    { length: 1000 },
    (_, index) => "22222222-2222-4222-8222-" + String(index + 1).padStart(12, "0"),
  );
  let loaded = 0;
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async () => undefined,
    loadRows: async (selected) => {
      loaded = selected.length;
      return [];
    },
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  const response = await handle(request(ids));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(loaded).toBe(1000);
  expect(result.items).toHaveLength(1000);
  expect(result.counts.skipped).toBe(1000);
});

test("malformed JSON is a bounded client error before any contact read", async () => {
  let reads = 0;
  const handle = createCrmContactFormatPreviewHandler({
    authorize: async () => undefined,
    loadRows: async () => {
      reads++;
      return [];
    },
    now: () => new Date("2026-09-30T00:00:00Z"),
  });
  for (const [body, status] of [
    ["{", 400],
    ["x".repeat(65537), 413],
  ] as const) {
    const response = await handle(new Request(url, { method: "POST", body }));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(reads).toBe(0);
});
