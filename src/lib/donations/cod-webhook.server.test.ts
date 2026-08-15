import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import { signRsaSha256 } from "./cod-crypto.server";
import {
  CodNotificationError,
  parseCodNotificationEnvelope,
  processCodNotification,
} from "./cod-webhook.server";

const notificationKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });

const config = {
  merchantId: "merchant-test",
  segmentId: "segment-test",
  notificationPublicKey: notificationKeys.publicKey,
};

function paymentData(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: "transaction-test",
    amount: 150,
    currency: "HKD",
    merchant_id: "merchant-test",
    segment_id: "segment-test",
    out_trade_no: "cod-order-test",
    type: "payment",
    status: "paid",
    wallet: "ALIPAYHK",
    ...overrides,
  };
}

function signedEnvelope(
  value: Record<string, unknown> = paymentData(),
  options: { data?: string; privateKey?: typeof notificationKeys.privateKey } = {},
) {
  const data = options.data ?? JSON.stringify(value);
  return {
    data,
    signature: signRsaSha256(
      Buffer.from(data, "utf8"),
      options.privateKey ?? notificationKeys.privateKey,
    ).toString("base64"),
    algorithm: "rsa-sha256",
  };
}

function fakePaymentClient(
  payment: { id: string; amount_cents: number; provider_ref: string } | null,
  error: unknown = null,
) {
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

describe("COD notification verification", () => {
  test("verifies the exact original data bytes before parsing", () => {
    const data = ` { "transaction_id":"transaction-test", "amount":150, "currency":"HKD", "merchant_id":"merchant-test", "segment_id":"segment-test", "out_trade_no":"cod-order-test", "type":"payment", "status":"paid", "wallet":"ALIPAYHK", "note":"香港" } `;
    const envelope = signedEnvelope(paymentData(), { data });

    expect(parseCodNotificationEnvelope(envelope, config)).toMatchObject({
      kind: "payment",
      transactionId: "transaction-test",
      amountCents: 15000,
      providerRef: "cod-order-test",
    });

    expect(() =>
      parseCodNotificationEnvelope({ ...envelope, data: `${data} ` }, config),
    ).toThrowError(new CodNotificationError("invalid_signature"));
  });

  test.each([
    ["invalid algorithm", () => ({ ...signedEnvelope(), algorithm: "RSA-SHA256" })],
    ["invalid base64", () => ({ ...signedEnvelope(), signature: "not-base64" })],
    [
      "wrong notification key",
      () => signedEnvelope(paymentData(), { privateKey: otherKeys.privateKey }),
    ],
  ])("rejects %s", (_name, createEnvelope) => {
    expect(() => parseCodNotificationEnvelope(createEnvelope(), config)).toThrow(
      CodNotificationError,
    );
  });

  test("rejects malformed JSON and missing required fields after signature verification", () => {
    expect(() =>
      parseCodNotificationEnvelope(signedEnvelope(paymentData(), { data: "not-json" }), config),
    ).toThrowError(new CodNotificationError("malformed_data"));
    expect(() =>
      parseCodNotificationEnvelope(
        signedEnvelope(paymentData({ transaction_id: undefined })),
        config,
      ),
    ).toThrowError(new CodNotificationError("malformed_data"));
  });

  test.each([
    ["merchant_mismatch", { merchant_id: "other" }],
    ["segment_mismatch", { segment_id: "other" }],
    ["currency_mismatch", { currency: "USD" }],
    ["wallet_mismatch", { wallet: "ALIPAY" }],
    ["type_mismatch", { type: "chargeback" }],
    ["status_mismatch", { status: "new" }],
    ["amount_sign_mismatch", { amount: -150 }],
  ])("classifies %s as permanent manual review", (reason, override) => {
    expect(
      parseCodNotificationEnvelope(signedEnvelope(paymentData(override)), config),
    ).toMatchObject({ kind: "manual_review", reason });
  });

  test("parses a documented negative full-refund amount and requires out_return_no", () => {
    const refund = paymentData({
      amount: -150,
      type: "refund",
      out_return_no: "refund-test",
    });
    expect(parseCodNotificationEnvelope(signedEnvelope(refund), config)).toMatchObject({
      kind: "refund",
      amountCents: 15000,
      outReturnNo: "refund-test",
    });

    delete refund.out_return_no;
    expect(() => parseCodNotificationEnvelope(signedEnvelope(refund), config)).toThrowError(
      new CodNotificationError("malformed_data"),
    );
  });
});

describe("COD notification lifecycle routing", () => {
  test("routes a matching payment through existing COD reconciliation with a stable event id", async () => {
    const { client, filters } = fakePaymentClient({
      id: "payment-test",
      amount_cents: 15000,
      provider_ref: "cod-order-test",
    });
    const reconciled: unknown[] = [];

    await processCodNotification({
      envelope: signedEnvelope(),
      config,
      client: client as never,
      reconcile: async (args) => {
        reconciled.push(args);
        return { kind: "applied" as const };
      },
    });

    expect(filters).toEqual([
      ["provider", "cod"],
      ["provider_ref", "cod-order-test"],
    ]);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "transaction-test:payment:paid:150",
      eventType: "payment.paid",
      payload: {
        transactionId: "transaction-test",
        providerRef: "cod-order-test",
        type: "payment",
        status: "paid",
        amountCents: 15000,
      },
    });
  });

  test("flags unmapped and amount-mismatched payments without crediting", async () => {
    for (const payment of [
      null,
      { id: "payment-test", amount_cents: 14999, provider_ref: "cod-order-test" },
    ]) {
      const { client } = fakePaymentClient(payment);
      const reviews: unknown[] = [];
      let credits = 0;

      await processCodNotification({
        envelope: signedEnvelope(),
        config,
        client: client as never,
        reconcile: async () => {
          credits += 1;
          return { kind: "applied" as const };
        },
        flagForReview: async (args, review) => {
          reviews.push({ args, review });
          return { kind: "manual_review" as const };
        },
      });

      expect(credits).toBe(0);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        args: { provider: "cod", providerRef: "cod-order-test" },
        review: { reason: payment ? "amount_mismatch" : "payment_not_found" },
      });
    }
  });

  test("routes full refunds through reversal and partial refunds to manual review", async () => {
    const refundEnvelope = signedEnvelope(
      paymentData({ amount: -150, type: "refund", out_return_no: "refund-test" }),
    );

    for (const amountCents of [15000, 20000]) {
      const { client } = fakePaymentClient({
        id: "payment-test",
        amount_cents: amountCents,
        provider_ref: "cod-order-test",
      });
      const refunds: unknown[] = [];
      const reviews: unknown[] = [];
      await processCodNotification({
        envelope: refundEnvelope,
        config,
        client: client as never,
        refund: async (args) => {
          refunds.push(args);
          return { kind: "refunded" as const };
        },
        flagForReview: async (args, review) => {
          reviews.push({ args, review });
          return { kind: "manual_review" as const };
        },
      });

      expect(refunds).toHaveLength(amountCents === 15000 ? 1 : 0);
      expect(reviews).toHaveLength(amountCents === 20000 ? 1 : 0);
      if (reviews.length) {
        expect(reviews[0]).toMatchObject({ review: { reason: "partial_refund" } });
      }
    }
  });

  test("propagates database lookup failures for provider retry", async () => {
    const { client } = fakePaymentClient(null, new Error("database unavailable"));
    await expect(
      processCodNotification({ envelope: signedEnvelope(), config, client: client as never }),
    ).rejects.toThrow("database unavailable");
  });
});
