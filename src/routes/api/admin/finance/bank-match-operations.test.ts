import type { BankMatchOperation } from "../../../../lib/donations/bankMatchConfirmation";
import { expect, test } from "bun:test";

import { createBankMatchOperationHandler } from "./bank-match-operations";

const operationId = "22222222-2222-4222-8222-222222222222";
const paymentId = "11111111-1111-4111-8111-111111111111";
const operation: BankMatchOperation = {
  operationId,
  fileSha256: "a".repeat(64),
  createdAt: "2026-09-28T00:00:00.000Z",
  expiresAt: "2026-09-28T00:15:00.000Z",
  state: "queued",
  items: [],
};

test("finance match API denies non-finance direct access before reads or writes", async () => {
  const calls: string[] = [];
  const handler = createBankMatchOperationHandler({
    authorize: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    create: async () => {
      calls.push("create");
      return operation;
    },
    get: async () => {
      calls.push("get");
      return operation;
    },
    apply: async () => {
      calls.push("apply");
      return { ordinal: 1, paymentId, status: "succeeded", reasonCode: null, deliveryJobId: null };
    },
  });
  for (const request of [
    new Request("https://example.invalid/api/admin/finance/bank-match-operations", {
      method: "POST",
      body: JSON.stringify({ csvText: "canonical", selectedOrdinals: [1] }),
    }),
    new Request(
      `https://example.invalid/api/admin/finance/bank-match-operations?operationId=${operationId}`,
    ),
    new Request("https://example.invalid/api/admin/finance/bank-match-operations", {
      method: "PATCH",
      body: JSON.stringify({ operationId, ordinal: 1 }),
    }),
  ]) {
    const response = await handler(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(calls).toEqual([]);
});

test("finance match API creates a bounded snapshot and applies one item for the verified actor", async () => {
  const calls: unknown[][] = [];
  const handler = createBankMatchOperationHandler({
    authorize: async () => "actor-id",
    create: async (...args) => {
      calls.push(["create", ...args]);
      return operation;
    },
    get: async (...args) => {
      calls.push(["get", ...args]);
      return operation;
    },
    apply: async (...args) => {
      calls.push(["apply", ...args]);
      return { ordinal: 1, paymentId, status: "succeeded", reasonCode: null, deliveryJobId: null };
    },
  });
  const created = await handler(
    new Request("https://example.invalid/api/admin/finance/bank-match-operations", {
      method: "POST",
      body: JSON.stringify({ csvText: "canonical", selectedOrdinals: [1] }),
    }),
  );
  expect(created.status).toBe(200);
  const fetched = await handler(
    new Request(
      `https://example.invalid/api/admin/finance/bank-match-operations?operationId=${operationId}`,
    ),
  );
  expect(fetched.status).toBe(200);
  const applied = await handler(
    new Request("https://example.invalid/api/admin/finance/bank-match-operations", {
      method: "PATCH",
      body: JSON.stringify({ operationId, ordinal: 1 }),
    }),
  );
  expect(applied.status).toBe(200);
  expect(calls).toEqual([
    ["create", "actor-id", "canonical", [1]],
    ["get", "actor-id", operationId],
    ["apply", "actor-id", operationId, 1],
  ]);
});
