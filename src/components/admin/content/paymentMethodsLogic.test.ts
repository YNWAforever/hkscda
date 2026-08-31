import { describe, expect, test } from "bun:test";

import {
  buildPaymentMethodSearchParams,
  canPublish,
  createPaymentMethodPublishAttempt,
  fetchPaymentMethodConfigs,
  mutatePaymentMethodConfig,
  resolveMutationError,
} from "./paymentMethodsLogic";

describe("buildPaymentMethodSearchParams", () => {
  test("omits method/state when 'all', defaults page/pageSize", () => {
    const params = buildPaymentMethodSearchParams({ method: "all", state: "all" });
    expect(params.get("method")).toBeNull();
    expect(params.get("state")).toBeNull();
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });

  test("includes an explicit method and state", () => {
    const params = buildPaymentMethodSearchParams({ method: "fps", state: "in_review" });
    expect(params.get("method")).toBe("fps");
    expect(params.get("state")).toBe("in_review");
  });
});

describe("fetchPaymentMethodConfigs", () => {
  test("requests the payment-methods list endpoint with the built query string", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const response = { items: [], total: 0, page: 1, pageSize: 25 };
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return response as T;
    };

    await fetchPaymentMethodConfigs({ method: "fps" }, request);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toContain("/api/admin/payment-methods?");
    expect(calls[0]?.path).toContain("method=fps");
  });
});

describe("mutatePaymentMethodConfig", () => {
  test("uses PATCH against the base id route for 'save'", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as T;
    };

    await mutatePaymentMethodConfig("abc", "save", { expectedVersion: 1 }, request);

    expect(calls).toEqual([
      {
        path: "/api/admin/payment-methods/abc",
        init: {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: 1 }),
        },
      },
    ]);
  });

  test("uses POST against the operation sub-route for 'publish'", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as T;
    };
    const payload = { expectedVersion: 1, idempotencyKey: "x" };

    await mutatePaymentMethodConfig("abc", "publish", payload, request);

    expect(calls).toEqual([
      {
        path: "/api/admin/payment-methods/abc/publish",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      },
    ]);
  });
});

describe("canPublish", () => {
  test("is false for a staff actor even on an in_review row", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "other" },
        currentActorAdminUserId: "me",
        currentActorRole: "staff",
      }),
    ).toBe(false);
  });

  test("is false when the treasurer is the same person who submitted", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "me" },
        currentActorAdminUserId: "me",
        currentActorRole: "treasurer",
      }),
    ).toBe(false);
  });

  test("is true for a different treasurer on an in_review row", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "other" },
        currentActorAdminUserId: "me",
        currentActorRole: "treasurer",
      }),
    ).toBe(true);
  });

  test("is false when the row is not in_review", () => {
    expect(
      canPublish({
        config: { state: "draft", submittedBy: null },
        currentActorAdminUserId: "me",
        currentActorRole: "admin",
      }),
    ).toBe(false);
  });
});

describe("createPaymentMethodPublishAttempt", () => {
  test("builds a payload carrying the given expectedVersion and a generated idempotency key", () => {
    const attempt = createPaymentMethodPublishAttempt(3, () => "fixed-key");
    expect(attempt.idempotencyKey).toBe("fixed-key");
    expect(attempt.payload).toEqual({ expectedVersion: 3, idempotencyKey: "fixed-key" });
  });
});

describe("resolveMutationError", () => {
  test("maps a structured 409 conflict response to a conflict result preserving the draft", () => {
    const result = resolveMutationError(
      { status: 409, error: { code: "conflict" } },
      { draft: true },
    );
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(result.preservedDraft).toEqual({ draft: true });
  });

  test("maps any other error to a generic error result", () => {
    const result = resolveMutationError(new Error("network down"), { draft: true });
    expect(result).toEqual({ kind: "error", message: "network down" });
  });
});
