import { expect, test } from "bun:test";

import { createDeliveryWorklistHandler } from "./delivery-jobs";

const request = (method = "GET", page = "1") =>
  new Request(`http://localhost/api/admin/finance/delivery-jobs?page=${page}`, { method });

test("delivery worklist denies non-finance roles before private reads", async () => {
  let reads = 0;
  const handler = createDeliveryWorklistHandler({
    authorize: async () => {
      throw new Response(null, { status: 403 });
    },
    list: async () => {
      reads++;
      return { jobs: [], total: 0, page: 1, pageSize: 25 };
    },
  });
  const result = await handler(request());
  expect(result.status).toBe(403);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(reads).toBe(0);
});

test("delivery worklist validates page, caps result and never maps failure to zero", async () => {
  const calls: number[] = [];
  const handler = createDeliveryWorklistHandler({
    authorize: async () => "actor",
    list: async (actor, page) => {
      expect(actor).toBe("actor");
      calls.push(page);
      return { jobs: [], total: 27, page, pageSize: 25 };
    },
  });
  const result = await handler(request("GET", "2"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ jobs: [], total: 27, page: 2, pageSize: 25 });
  expect(calls).toEqual([2]);
  expect((await handler(request("GET", "0"))).status).toBe(400);
  expect((await handler(request("GET", "abc"))).status).toBe(400);
  expect((await handler(request("POST"))).status).toBe(405);
  const broken = createDeliveryWorklistHandler({
    authorize: async () => "actor",
    list: async () => {
      throw new Error("DB unavailable");
    },
  });
  const unavailable = await broken(request());
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ error: "Delivery worklist unavailable" });
});

test("current SQL actor revocation returns forbidden without a job list", async () => {
  const handler = createDeliveryWorklistHandler({
    authorize: async () => "actor",
    list: async () => {
      throw Object.assign(new Error("revoked"), { code: "42501" });
    },
  });
  const response = await handler(request());
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Access denied" });
});
