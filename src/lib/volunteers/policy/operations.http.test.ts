import { expect, test } from "bun:test";
import { createOperationHandlers } from "./operations.http.server";
const request = (body: unknown) =>
  new Request("http://localhost/api/volunteer/operations", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("operation boundary authorizes before CAPTCHA and rejects forged actor", async () => {
  let calls = 0;
  let checks = 0;
  const blocked = createOperationHandlers({
    authenticate: async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
    verify: async () => {
      checks++;
      return true;
    },
    execute: async () => {
      calls++;
      return { kind: "listed" };
    },
  });
  expect((await blocked.POST(request({ command: { action: "list" } }))).status).toBe(401);
  expect(checks).toBe(0);
  expect(calls).toBe(0);
  const h = createOperationHandlers({
    authenticate: async () => "verified",
    execute: async () => {
      calls++;
      return { kind: "listed" };
    },
  });
  expect((await h.POST(request({ action: "list", actor: "forged" }))).status).toBe(400);
  expect(calls).toBe(0);
});
test("public writes require CAPTCHA; list and stale preview retain actor binding", async () => {
  let actor = "";
  let calls = 0;
  const h = createOperationHandlers({
    authenticate: async () => "verified-owner",
    verify: async (token) => token === "valid",
    execute: async (id) => {
      actor = id;
      calls++;
      return { kind: "conflict" };
    },
  });
  const command = {
    action: "move_apply",
    preview_id: "22222222-2222-4222-8222-222222222222",
    idempotency_key: "33333333-3333-4333-8333-333333333333",
    reason: "Change date",
  };
  expect((await h.POST(request({ command }))).status).toBe(403);
  expect(calls).toBe(0);
  const response = await h.POST(request({ command, turnstileToken: "valid" }));
  expect(response.status).toBe(409);
  expect(actor).toBe("verified-owner");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await h.POST(request({ command: { action: "list" } }))).status).toBe(409);
  expect(calls).toBe(2);
});
