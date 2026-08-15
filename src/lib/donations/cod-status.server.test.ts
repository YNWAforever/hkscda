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
  provider: "cod",
  provider_ref: "cod-order-test",
  status: "pending",
};

describe("pending COD status refresh", () => {
  test("queries only a pending COD payment and reconciles paid through the existing lifecycle", async () => {
    const { client, filters } = statusClient(pendingPayment);
    const refreshed: string[] = [];
    const reconciled: unknown[] = [];

    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      createClient: () => ({
        refreshTransactionStatus: async ({ outTradeNo }) => {
          refreshed.push(outTradeNo);
          return { status: "paid" as const };
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
      ["status", "pending"],
    ]);
    expect(refreshed).toEqual(["cod-order-test"]);
    expect(reconciled[0]).toMatchObject({
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "refresh:cod-order-test:paid",
      eventType: "refresh_transaction_status.paid",
      payload: { source: "status_refresh", status: "paid", providerRef: "cod-order-test" },
    });
    expect(result).toMatchObject({ kind: "reconciled" });
  });

  test("does not instantiate the COD client when no matching pending payment exists", async () => {
    const { client } = statusClient(null);
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

  test.each(["not_exists", "new", "expired", "canceled", "failed"] as const)(
    "leaves %s pending",
    async (status) => {
      const { client } = statusClient(pendingPayment);
      let reconciliations = 0;
      const result = await refreshPendingCodDonation({
        donationId: "donation-test",
        client: client as never,
        createClient: () => ({ refreshTransactionStatus: async () => ({ status }) }),
        reconcile: async () => {
          reconciliations += 1;
          return { kind: "applied" as const };
        },
      });

      expect(reconciliations).toBe(0);
      expect(result).toEqual({ kind: "pending", providerStatus: status });
    },
  );

  test("swallows COD transport errors and leaves local state pending", async () => {
    const { client } = statusClient(pendingPayment);
    const result = await refreshPendingCodDonation({
      donationId: "donation-test",
      client: client as never,
      createClient: () => ({
        refreshTransactionStatus: async () => {
          throw new Error("transport unavailable");
        },
      }),
    });
    expect(result).toEqual({ kind: "pending", providerStatus: "unavailable" });
  });
});
