import { expect, test } from "bun:test";
import { createDirectoryHandler } from "./http.server";
import { MAX_ADMIN_JSON_BYTES } from "../../http/adminJson.server";
const request = (query = "") => new Request(`http://localhost/api/admin/volunteers/people${query}`);

test("POST body search preserves authorization and never reads a q URL", async () => {
  const seen: unknown[] = [];
  const handler = createDirectoryHandler({
    authorize: async () => "staff",
    read: async (_actor, input) => {
      seen.push(input);
      return { profiles: [], total: 0, page: 1, limit: 25 };
    },
  });
  const response = await handler(
    new Request("http://localhost/api/admin/volunteers/people", {
      method: "POST",
      body: JSON.stringify({ q: "audit@example.invalid", page: 1 }),
      headers: { "content-type": "application/json" },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(seen).toEqual([{ q: "audit@example.invalid", page: 1, limit: 25 }]);
});
test("POST oversized and invalid bodies are refused before reads", async () => {
  let reads = 0;
  const handler = createDirectoryHandler({
    authorize: async () => "staff",
    read: async () => {
      reads++;
      return null;
    },
  });
  for (const [body, status] of [
    ["{bad", 400],
    [JSON.stringify({ q: "x".repeat(MAX_ADMIN_JSON_BYTES + 1) }), 413],
  ] as const)
    expect(
      (
        await handler(
          new Request("http://localhost/api/admin/volunteers/people", {
            method: "POST",
            body: String(body),
            headers: { "content-type": "application/json" },
          }),
        )
      ).status,
    ).toBe(status);
  expect(reads).toBe(0);
});
test("unauthorized never reaches repository and response is not cached", async () => {
  let calls = 0;
  const handler = createDirectoryHandler({
    authorize: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    read: async () => {
      calls++;
      return null;
    },
  });
  const response = await handler(request());
  expect(response.status).toBe(403);
  expect(calls).toBe(0);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("invalid filters and page size fail before reads", async () => {
  let calls = 0;
  const handler = createDirectoryHandler({
    authorize: async () => "actor",
    read: async () => {
      calls++;
      return null;
    },
  });
  for (const q of [
    "?limit=51",
    "?page=0",
    "?status=bad",
    "?tier=bad",
    "?profile_id=bad",
    "?q=" + "x".repeat(201),
  ])
    expect((await handler(request(q))).status).toBe(400);
  expect(calls).toBe(0);
});
test("literal search and defaults pass through; missing detail is 404", async () => {
  const handler = createDirectoryHandler({
    authorize: async () => "actor",
    read: async (actor, input) => {
      expect(actor).toBe("actor");
      expect(input).toMatchObject({ q: "a%_", page: 1, limit: 25 });
      return { profiles: [], total: 0, page: 1, limit: 25 };
    },
  });
  expect((await handler(request("?q=a%25_"))).status).toBe(200);
  const missing = createDirectoryHandler({
    authorize: async () => "actor",
    read: async () => null,
  });
  expect((await missing(request("?profile_id=11111111-1111-4111-8111-111111111111"))).status).toBe(
    404,
  );
});
test("repository errors have a safe response", async () => {
  const handler = createDirectoryHandler({
    authorize: async () => "actor",
    read: async () => {
      throw new Error("private database detail");
    },
  });
  const response = await handler(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private database");
});
