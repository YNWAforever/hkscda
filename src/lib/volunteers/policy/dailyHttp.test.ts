import { expect, test } from "bun:test";
import { createDailyPolicyHandlers } from "./dailyHttp.server";
const request = (body: unknown) =>
  new Request("http://localhost/api/admin/volunteers/daily-settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("day API authorizes before executing and rejects caller actor injection", async () => {
  let calls = 0;
  const denied = createDailyPolicyHandlers({
    requireActor: async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
    execute: async () => {
      calls++;
      return {};
    },
  });
  expect((await denied.POST(request({ action: "list" }))).status).toBe(401);
  expect(calls).toBe(0);
  const h = createDailyPolicyHandlers({
    requireActor: async () => ({ authUserId: "server-actor" }),
    execute: async () => {
      calls++;
      return {};
    },
  });
  expect((await h.POST(request({ action: "list", p_actor: "forged" }))).status).toBe(400);
  expect(calls).toBe(0);
});
test("day API maps stale review to409 and passes only verified actor", async () => {
  let actor = "";
  const h = createDailyPolicyHandlers({
    requireActor: async () => ({ authUserId: "verified-admin" }),
    execute: async (id) => {
      actor = id;
      return { kind: "conflict" };
    },
  });
  const response = await h.POST(
    request({
      action: "publish",
      preview_id: "22222222-2222-4222-8222-222222222222",
      idempotency_key: "33333333-3333-4333-8333-333333333333",
      reason: "更改全日名額",
    }),
  );
  expect(actor).toBe("verified-admin");
  expect(response.status).toBe(409);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
