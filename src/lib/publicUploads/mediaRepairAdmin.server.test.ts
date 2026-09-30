import { expect, test } from "bun:test";

import { createMediaRepairAdminHandler } from "./mediaRepairAdmin.server";

const endpoint = "https://example.test/api/admin/media-repairs";
const request = (body: unknown) =>
  new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("direct API rejects a non-staff role before queue read or retry", async () => {
  let calls = 0;
  const handler = createMediaRepairAdminHandler({
    requireAdmin: async () => {
      throw new Response("forbidden", { status: 403 });
    },
    list: async () => {
      calls++;
      return {};
    },
    retry: async () => {
      calls++;
      return true;
    },
  });
  expect((await handler.list(new Request(endpoint))).status).toBe(403);
  expect((await handler.retry(request({}))).status).toBe(403);
  expect(calls).toBe(0);
});

test("staff can read bounded aggregate queue without caching", async () => {
  const handler = createMediaRepairAdminHandler({
    requireAdmin: async () => ({ authUserId: "actor" }),
    list: async (actor) => ({ actor, pending: 2, items: [] }),
    retry: async () => true,
  });
  const response = await handler.list(new Request(endpoint));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ actor: "actor", pending: 2, items: [] });
});

test("manual retry requires a corrected cause and an operator reason", async () => {
  let calls = 0;
  const handler = createMediaRepairAdminHandler({
    requireAdmin: async () => ({ authUserId: "actor" }),
    list: async () => ({}),
    retry: async () => {
      calls++;
      return true;
    },
  });
  expect(
    (
      await handler.retry(
        request({
          kind: "animal",
          itemId: "path",
          reason: "Fixed source",
          causeCorrected: false,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await handler.retry(
        request({
          kind: "animal",
          itemId: "path",
          reason: "short",
          causeCorrected: true,
        }),
      )
    ).status,
  ).toBe(400);
  expect(calls).toBe(0);
  const response = await handler.retry(
    request({
      kind: "animal",
      itemId: "path",
      reason: "Source image restored",
      causeCorrected: true,
    }),
  );
  expect(response.status).toBe(200);
  expect(calls).toBe(1);
});
