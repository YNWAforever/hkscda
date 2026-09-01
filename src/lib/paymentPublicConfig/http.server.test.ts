import { describe, expect, test } from "bun:test";

import { createPaymentPublicConfigHandlers } from "./http.server";
import { createPaymentPublicConfigService, type PaymentPublicConfigActor } from "./service";
import type { PaymentPublicConfigRepository } from "./repository.server";

const TREASURER: PaymentPublicConfigActor = {
  adminUserId: "admin-1",
  authUserId: "auth-1",
  role: "treasurer",
};
const STAFF: PaymentPublicConfigActor = {
  adminUserId: "admin-2",
  authUserId: "auth-2",
  role: "staff",
};

function fakeRepository(): PaymentPublicConfigRepository {
  return {
    list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    getById: async () => null,
    create: async () => {
      throw new Error("not used");
    },
    update: async () => {
      throw new Error("not used");
    },
    transition: async () => {
      throw new Error("not used");
    },
    publish: async () => ({ configId: "id", configVersion: 2, method: "fps" as const }),
  };
}

function buildHandlers(actor: PaymentPublicConfigActor) {
  const service = createPaymentPublicConfigService(fakeRepository());
  return createPaymentPublicConfigHandlers({ requireActor: async () => actor, service });
}

describe("createPaymentPublicConfigHandlers", () => {
  test("publish returns 403 for a staff actor", async () => {
    const handlers = buildHandlers(STAFF);
    const response = await handlers.publish(
      new Request("http://x/publish", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "a".repeat(32) }),
      }),
      { id: "11111111-1111-1111-1111-111111111111" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  test("publish succeeds for a treasurer actor", async () => {
    const handlers = buildHandlers(TREASURER);
    const response = await handlers.publish(
      new Request("http://x/publish", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "a".repeat(32) }),
      }),
      { id: "11111111-1111-1111-1111-111111111111" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      configId: "id",
      configVersion: 2,
      method: "fps",
    });
  });

  test("get returns 404 for a missing row", async () => {
    const handlers = buildHandlers(TREASURER);
    const response = await handlers.get(new Request("http://x"), {
      id: "11111111-1111-1111-1111-111111111111",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Payment method configuration not found.",
      },
    });
  });

  test("create returns a 400 validation error for an invalid body", async () => {
    const handlers = buildHandlers(STAFF);
    const response = await handlers.create(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ method: "bank_transfer" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
      },
    });
  });
});
