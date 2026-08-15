import { describe, expect, test } from "bun:test";

import { refreshPendingCodDonation } from "./cod-status.server";

function statusClient(payment: Record<string, unknown> | null, error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  return {
    filters,
    client: {
      from(table: string) {
        expect(table).toBe("payment");
        return {
          select() {
            return {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return this;
              },
              in(column: string, value: unknown) {
                filters.push([column, value]);
                return this;
              },
              maybeSingle() {
                return Promise.resolve({ data: payment, error });
              },
            };
          },
        };
      },
    },
  };
}

const pendingPayment = {
  id: "payment-test",
  provider_ref: "cod-order-test",
  provider_order_ref: "hkscda-order-test",
  amount_cents: 30_000,
  status: "pending",
};

const validDetails = {
  amount: 300,
  currency: "HKD",
  wallet: "ALIPAYHK",
  orderRef: "hkscda-order-test",
  status: "paid",
  outTradeNo: "cod-order-test",
  transactionId: "alipay-transaction-test",
  subject: "HKSCDA Donation",
  type: "payment",
  segmentId: "segment-test",
  merchantId: "merchant-test",
};

const providerIdentity = { merchantId: "merchant-test", segmentId: "segment-test" };

describe("pending COD status refresh", () => {
  test("binds paid refresh to supported order details before reconciling", async () => {
    const { client, filters } = statusClient(pendingPayment);
    const reconciled: unknown[] = [];
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      config: providerIdentity,
      createClient: () => ({
        refreshTransactionStatus: async () => ({ status: "paid" as const }),
        getOrderDetails: async ({ orderRef }) => {
          expect(orderRef).toBe("hkscda-order-test");
          return validDetails;
        },
      }),
      reconcile: async (args) => {
        reconciled.push(args);
        return { kind: "applied" as const };
      },
    });

    expect(filters).toEqual([
      ["donation_id", "donation-test"],
      ["provider", "cod"],
      ["status", ["pending", "succeeded"]],
    ]);
    expect(reconciled[0]).toMatchObject({
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "refresh:alipay-transaction-test:cod-order-test:paid",
      eventType: "order_details.paid",
      payload: {
        source: "status_refresh",
        transactionId: "alipay-transaction-test",
        outTradeNo: "cod-order-test",
        orderRef: "hkscda-order-test",
      },
    });
    expect(result).toMatchObject({ kind: "reconciled" });
  });

  test.each([
    ["merchant", { merchantId: "wrong" }],
    ["segment", { segmentId: "wrong" }],
    ["currency", { currency: "USD" }],
    ["wallet", { wallet: "ALIPAYCN" }],
    ["type", { type: "refund" }],
    ["status", { status: "new" }],
    ["out trade number", { outTradeNo: "other" }],
    ["order reference", { orderRef: "other" }],
    ["amount", { amount: 299.99 }],
    ["transaction id", { transactionId: "" }],
  ] as const)("fails closed on a %s mismatch", async (_label, mismatch) => {
    const { client } = statusClient(pendingPayment);
    let reconciliations = 0;
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      config: providerIdentity,
      createClient: () => ({
        refreshTransactionStatus: async () => ({ status: "paid" as const }),
        getOrderDetails: async () => ({ ...validDetails, ...mismatch }),
      }),
      reconcile: async () => {
        reconciliations += 1;
      },
    });

    expect(reconciliations).toBe(0);
    expect(result).toEqual({ kind: "pending", providerStatus: "details_mismatch" });
  });

  test("recovers idempotent side effects for an already-succeeded COD payment", async () => {
    const { client } = statusClient({ ...pendingPayment, status: "succeeded" });
    const recovered: string[] = [];
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      recoverSideEffects: async (_client, paymentId) => recovered.push(paymentId),
      createClient: () => {
        throw new Error("provider client must not be used");
      },
    });

    expect(recovered).toEqual(["payment-test"]);
    expect(result).toEqual({ kind: "recovered" });
  });

  test.each(["not_exists", "new", "expired", "canceled", "failed"] as const)(
    "leaves %s pending without requesting details",
    async (status) => {
      const { client } = statusClient(pendingPayment);
      let detailCalls = 0;
      const result = await refreshPendingCodDonation({
        donationId: "donation-test",
        client: client as never,
        createClient: () => ({
          refreshTransactionStatus: async () => ({ status }),
          getOrderDetails: async () => {
            detailCalls += 1;
            return validDetails;
          },
        }),
      });
      expect(detailCalls).toBe(0);
      expect(result).toEqual({ kind: "pending", providerStatus: status });
    },
  );

  test("fails closed when the supported order reference was not persisted", async () => {
    const { client } = statusClient({ ...pendingPayment, provider_order_ref: null });
    let clientCreations = 0;
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      createClient: () => {
        clientCreations += 1;
        throw new Error("must not be called");
      },
    });
    expect(clientCreations).toBe(0);
    expect(result).toEqual({ kind: "not_applicable" });
  });

  test("swallows COD transport errors and leaves local state pending", async () => {
    const { client } = statusClient(pendingPayment);
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      createClient: () => ({
        refreshTransactionStatus: async () => {
          throw new Error("transport unavailable");
        },
        getOrderDetails: async () => validDetails,
      }),
    });
    expect(result).toEqual({ kind: "pending", providerStatus: "unavailable" });
  });
});
