import { expect, test } from "bun:test";
import { createManualGiftDeliveryHandlers } from "./manualGiftDelivery.http.server";
const jobId = "11111111-2222-4333-8444-555555555555";
const committed = {
  donationId: "gift",
  paymentId: "payment",
  deliveryJobId: jobId,
  replayed: false,
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      requireTreasurer: async () => {
        calls.push("auth");
        return { authUserId: "actor" };
      },
      createGift: async () => {
        calls.push("commit");
        return committed;
      },
      run: async () => {
        calls.push("run");
        return { kind: "complete" as const };
      },
      status: async () => "pending" as const,
      retryJob: async () => {
        calls.push("retry");
        return true;
      },
      ...overrides,
    },
  };
}
const request = () =>
  new Request("http://localhost/api/admin/donations/manual", { method: "POST", body: "{}" });
test("committed gift remains success when delivery fails", async () => {
  const { deps, calls } = fixture({
    run: async () => {
      throw new Error("provider unavailable");
    },
  });
  const response = await createManualGiftDeliveryHandlers(deps).create(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ...committed, deliveryStatus: "pending" });
  expect(calls).toEqual(["auth", "commit"]);
});
test("denied requests cannot commit or retry", async () => {
  const { deps, calls } = fixture({
    requireTreasurer: async () => {
      throw new Response(null, { status: 403 });
    },
  });
  const handlers = createManualGiftDeliveryHandlers(deps);
  expect((await handlers.create(request())).status).toBe(403);
  expect((await handlers.retry(request(), jobId)).status).toBe(403);
  expect(calls).toEqual([]);
});
test("complete job retry returns complete without another delivery", async () => {
  const { deps, calls } = fixture({ status: async () => "complete" as const });
  const response = await createManualGiftDeliveryHandlers(deps).retry(request(), jobId);
  expect(await response.json()).toEqual({ deliveryStatus: "complete" });
  expect(calls).toEqual(["auth"]);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("missing job and malformed id never call retry", async () => {
  const { deps, calls } = fixture({ status: async () => null });
  const handlers = createManualGiftDeliveryHandlers(deps);
  expect((await handlers.retry(request(), jobId)).status).toBe(404);
  expect((await handlers.retry(request(), "invalid")).status).toBe(400);
  expect(calls).toEqual(["auth", "auth"]);
});
test("changed gift payload conflict does not attempt delivery", async () => {
  const { deps, calls } = fixture({
    createGift: async () => {
      throw Response.json({ error: "Conflict" }, { status: 409 });
    },
  });
  expect((await createManualGiftDeliveryHandlers(deps).create(request())).status).toBe(409);
  expect(calls).toEqual(["auth"]);
});
