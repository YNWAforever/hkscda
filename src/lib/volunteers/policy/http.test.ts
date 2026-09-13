import { expect, test } from "bun:test";
import { createPolicyHandlers } from "./http.server";

test("unverified callers cannot read policy drafts or call mutation commands", async () => {
  let calls = 0;
  const handlers = createPolicyHandlers({
    requireActor: async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
    execute: async () => {
      calls++;
      return {};
    },
  });
  const response = await handlers.POST(
    new Request("http://localhost/api/admin/volunteers/settings", {
      method: "POST",
      body: JSON.stringify({ action: "list" }),
    }),
  );
  expect(response.status).toBe(401);
  expect(calls).toBe(0);
});

test("server supplied actor wins and caller cannot inject actor identity", async () => {
  let calls = 0;
  const handlers = createPolicyHandlers({
    requireActor: async () => ({ authUserId: "11111111-1111-4111-8111-111111111111" }),
    execute: async () => {
      calls++;
      return {};
    },
  });
  const response = await handlers.POST(
    new Request("http://localhost/api/admin/volunteers/settings", {
      method: "POST",
      body: JSON.stringify({ action: "list", actor_user_id: "attacker" }),
    }),
  );
  expect(response.status).toBe(400);
  expect(calls).toBe(0);
});

test("stale preview becomes 409 with the current impact and no-store", async () => {
  const handlers = createPolicyHandlers({
    requireActor: async () => ({ authUserId: "11111111-1111-4111-8111-111111111111" }),
    execute: async () => ({ kind: "conflict", current: { revision: 2 } }),
  });
  const response = await handlers.POST(
    new Request("http://localhost/api/admin/volunteers/settings", {
      method: "POST",
      body: JSON.stringify({
        action: "publish",
        preview_id: "22222222-2222-4222-8222-222222222222",
        idempotency_key: "33333333-3333-4333-8333-333333333333",
        reason: "調整名額",
      }),
    }),
  );
  expect(response.status).toBe(409);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).current.revision).toBe(2);
});
