import { describe, expect, mock, test } from "bun:test";

import { createPaymentPublicConfigRouteDelegates, toPaymentPublicConfigActor } from "./-handlers";

const configId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";

function request(path: string, method = "GET") {
  return new Request(`https://test${path}`, { method });
}

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

  test("calling one delegate invokes only its correspondingly-named handler method", async () => {
    const methodNames = [
      "list",
      "create",
      "get",
      "update",
      "submit",
      "withdraw",
      "returnToDraft",
      "publish",
    ] as const;

    function createHandlersMock() {
      const response = () =>
        Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      return {
        list: mock(async () => response()),
        create: mock(async () => response()),
        get: mock(async () => response()),
        update: mock(async () => response()),
        submit: mock(async () => response()),
        withdraw: mock(async () => response()),
        returnToDraft: mock(async () => response()),
        publish: mock(async () => response()),
      };
    }

    type Routes = ReturnType<typeof createPaymentPublicConfigRouteDelegates>;
    const params = { id: configId };
    const invocations: Record<(typeof methodNames)[number], (routes: Routes) => Promise<Response>> =
      {
        list: (routes) => routes.list(request("/api/admin/payment-methods")),
        create: (routes) => routes.create(request("/api/admin/payment-methods", "POST")),
        get: (routes) => routes.get(request(`/api/admin/payment-methods/${configId}`), params),
        update: (routes) =>
          routes.update(request(`/api/admin/payment-methods/${configId}`, "PATCH"), params),
        submit: (routes) =>
          routes.submit(request(`/api/admin/payment-methods/${configId}/submit`, "POST"), params),
        withdraw: (routes) =>
          routes.withdraw(
            request(`/api/admin/payment-methods/${configId}/withdraw`, "POST"),
            params,
          ),
        returnToDraft: (routes) =>
          routes.returnToDraft(
            request(`/api/admin/payment-methods/${configId}/return-to-draft`, "POST"),
            params,
          ),
        publish: (routes) =>
          routes.publish(request(`/api/admin/payment-methods/${configId}/publish`, "POST"), params),
      };

    for (const invokedName of methodNames) {
      const handlers = createHandlersMock();
      const routes = createPaymentPublicConfigRouteDelegates(() => handlers);

      await invocations[invokedName](routes);

      for (const methodName of methodNames) {
        expect(handlers[methodName]).toHaveBeenCalledTimes(methodName === invokedName ? 1 : 0);
      }
    }
  });
});
