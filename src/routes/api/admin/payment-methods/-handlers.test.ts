import { describe, expect, test } from "bun:test";

import { createPaymentPublicConfigRouteDelegates, toPaymentPublicConfigActor } from "./-handlers";

describe("toPaymentPublicConfigActor", () => {
  test("maps an admin_user row to an actor", () => {
    const actor = toPaymentPublicConfigActor({
      id: "admin-1",
      authUserId: "auth-1",
      email: "a@example.com",
      role: "treasurer",
      status: "active",
    });
    expect(actor).toEqual({ adminUserId: "admin-1", authUserId: "auth-1", role: "treasurer" });
  });
});

describe("createPaymentPublicConfigRouteDelegates", () => {
  test("returns a 500 JSON response when the handler factory throws", async () => {
    const delegates = createPaymentPublicConfigRouteDelegates(() => {
      throw new Error("boom");
    });
    const response = await delegates.list(new Request("http://x"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal");
  });
});
