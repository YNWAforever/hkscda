import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";

import type { CodConfig } from "./config.server";
import { createCodAlipayHkCheckout, createCodOrderReference } from "./cod-provider.server";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

function config(): CodConfig {
  return {
    environment: "sandbox",
    merchantId: "merchant-test",
    segmentId: "segment-test",
    aesKey: Buffer.alloc(16, 19),
    privateKey: keyPair.privateKey,
    notificationPublicKey: keyPair.publicKey,
    apiBase: "https://aqs-api.sandbox-codpayment.com",
    cipherSuite: "aes-128-cbc-pkcs7-with-rsa-sha256",
  };
}

const input = {
  donationId: "donation-123",
  paymentId: "payment:unsafe id/123",
  amountCents: 12345,
  donorEmail: "never-include@example.com",
  purpose: "general" as const,
  checkoutExperience: "wap" as const,
};

describe("COD AlipayHK provider adapter", () => {
  test("uses a stable, COD-safe order reference", () => {
    const first = createCodOrderReference(input.paymentId);

    expect(first).toBe(createCodOrderReference(input.paymentId));
    expect(first).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  test("composes a WAP hosted URL server-side without exposing the order payload", async () => {
    let clientInput: unknown;
    const result = await createCodAlipayHkCheckout(input, {
      config: config(),
      createClient: () => ({
        async createOrder(order) {
          clientInput = order;
          return {
            url: "https://gateway.example/pay",
            alipayOrderString: "service=create_forex_trade_wap&out_trade_no=COD-1",
            outTradeNo: "COD-1",
          };
        },
      }),
    });

    expect(clientInput).toEqual({
      orderRef: createCodOrderReference(input.paymentId),
      amount: 123.45,
      subject: "HKSCDA Donation 香港拯救貓狗協會捐款",
      returnUrl: "http://localhost:5173/donate?status=pending&donation=donation-123",
      paymentSolution: "WAP",
    });
    expect(result).toEqual({
      providerRef: "COD-1",
      providerOrderRef: createCodOrderReference(input.paymentId),
      url: "https://gateway.example/pay?service=create_forex_trade_wap&out_trade_no=COD-1",
    });
    expect(JSON.stringify(result)).not.toContain("alipayOrderString");
  });

  test("uses PC2MOBILE and preserves an existing hosted URL query", async () => {
    const result = await createCodAlipayHkCheckout(
      { ...input, checkoutExperience: "desktop_qr" },
      {
        config: config(),
        createClient: () => ({
          async createOrder(order) {
            expect(order.paymentSolution).toBe("PC2MOBILE");
            return {
              url: "https://gateway.example/pay?source=cod",
              alipayOrderString: "service=create_forex_trade_wap&out_trade_no=COD-2",
              outTradeNo: "COD-2",
            };
          },
        }),
      },
    );

    expect(result).toEqual({
      providerRef: "COD-2",
      providerOrderRef: createCodOrderReference(input.paymentId),
      url: "https://gateway.example/pay?source=cod&service=create_forex_trade_wap&out_trade_no=COD-2",
    });
  });

  test("rejects a non-HTTPS gateway URL", async () => {
    await expect(
      createCodAlipayHkCheckout(input, {
        config: config(),
        createClient: () => ({
          async createOrder() {
            return {
              url: "http://gateway.example/pay",
              alipayOrderString: "service=create_forex_trade_wap",
              outTradeNo: "COD-1",
            };
          },
        }),
      }),
    ).rejects.toThrow("HTTPS");
  });

  test("rejects a hosted URL with a fragment before composing the order string", async () => {
    await expect(
      createCodAlipayHkCheckout(input, {
        config: config(),
        createClient: () => ({
          async createOrder() {
            return {
              url: "https://gateway.example/pay#fragment",
              alipayOrderString: "service=create_forex_trade_wap",
              outTradeNo: "COD-1",
            };
          },
        }),
      }),
    ).rejects.toThrow("fragment");
  });
});
