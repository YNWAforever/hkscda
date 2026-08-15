import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";

import type { CodConfig } from "./config.server";
import { aesCbcDecrypt, aesCbcEncrypt, decodeBase64Strict, encodeBase64 } from "./cod-crypto.server";
import { CodClientError, createCodClient } from "./cod-client.server";

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

function encryptedResponse(payload: unknown) {
  const currentConfig = config();
  const { iv, ciphertext } = aesCbcEncrypt(
    Buffer.from(JSON.stringify(payload), "utf8"),
    currentConfig.aesKey,
    Buffer.alloc(16, 3),
  );

  return Response.json({
    success: true,
    reference_id: "request-ref",
    result: { nonce: encodeBase64(iv), message: encodeBase64(ciphertext) },
  });
}

function decryptRequest(body: string) {
  const envelope = JSON.parse(body) as { nonce: string; message: string };
  return JSON.parse(
    aesCbcDecrypt(
      decodeBase64Strict(envelope.message, "message"),
      config().aesKey,
      decodeBase64Strict(envelope.nonce, "nonce"),
    ).toString("utf8"),
  ) as Record<string, unknown>;
}

describe("COD encrypted client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("encrypts the exact create_order protocol request", async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    globalThis.fetch = (async (input, init) => {
      captured = { input, init };
      return encryptedResponse({
        url: "https://gateway.example/pay",
        alipay_order_string: "service=create_forex_trade_wap&out_trade_no=COD-1",
        out_trade_no: "COD-1",
      });
    }) as typeof fetch;

    const client = createCodClient({
      config: config(),
      now: () => new Date("2026-08-16T00:00:09.000Z"),
      requestUuid: () => "123e4567-e89b-12d3-a456-426614174000",
    });
    const result = await client.createOrder({
      orderRef: "hkscda-payment-123",
      amount: 123.45,
      subject: "HKSCDA Donation 香港拯救貓狗協會捐款",
      returnUrl: "https://hkscda.example/donate?status=pending&donation=donation-1",
      paymentSolution: "WAP",
    });

    expect(result).toEqual({
      url: "https://gateway.example/pay",
      alipayOrderString: "service=create_forex_trade_wap&out_trade_no=COD-1",
      outTradeNo: "COD-1",
    });
    expect(String(captured?.input)).toBe("https://aqs-api.sandbox-codpayment.com/v1/service");
    expect(captured?.init?.method).toBe("POST");
    expect(new Headers(captured?.init?.headers).get("content-type")).toContain("application/json");

    const request = decryptRequest(String(captured?.init?.body));
    expect(request).toMatchObject({
      request_uuid: "123e4567-e89b-12d3-a456-426614174000",
      request_time: "1786838409",
      service: "create_order",
      merchant_id: "merchant-test",
      parameters: {
        order_ref: "hkscda-payment-123",
        segment_id: "segment-test",
        amount: 123.45,
        currency: "HKD",
        subject: "HKSCDA Donation 香港拯救貓狗協會捐款",
        wallet: "ALIPAYHK",
        return_url: "https://hkscda.example/donate?status=pending&donation=donation-1",
        payment_solution: "WAP",
        timeout: 5,
      },
    });
  });

  test.each([
    ["paid", "paid"],
    ["not_exists", "not_exists"],
    ["new", "new"],
    ["expired", "expired"],
    ["canceled", "canceled"],
    ["failed", "failed"],
  ] as const)("maps the %s transaction status", async (status, expected) => {
    let capturedBody = "";
    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body);
      return encryptedResponse({ status });
    }) as typeof fetch;

    const result = await createCodClient({ config: config() }).refreshTransactionStatus({
      outTradeNo: "COD-1",
    });

    expect(result).toEqual({ status: expected });
    expect(decryptRequest(capturedBody)).toMatchObject({
      service: "refresh_transaction_status",
      parameters: { out_trade_no: "COD-1", segment_id: "segment-test", request_details: true },
    });
  });

  test("rejects malformed, failed, and incomplete responses without a retry", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({ success: false, error_code: "wrong_parameters" }, { status: 422 });
    }) as typeof fetch;

    await expect(
      createCodClient({ config: config() }).createOrder({
        orderRef: "hkscda-payment-1",
        amount: 100,
        subject: "HKSCDA Donation 香港拯救貓狗協會捐款",
        returnUrl: "https://hkscda.example/donate?status=pending&donation=donation-1",
        paymentSolution: "PC2MOBILE",
      }),
    ).rejects.toMatchObject({ category: "business" } satisfies Partial<CodClientError>);
    expect(calls).toBe(1);

    globalThis.fetch = (async () => encryptedResponse({ url: "https://gateway.example/pay" })) as typeof fetch;
    await expect(
      createCodClient({ config: config() }).createOrder({
        orderRef: "hkscda-payment-2",
        amount: 100,
        subject: "HKSCDA Donation 香港拯救貓狗協會捐款",
        returnUrl: "https://hkscda.example/donate?status=pending&donation=donation-1",
        paymentSolution: "PC2MOBILE",
      }),
    ).rejects.toMatchObject({ category: "malformed_response" } satisfies Partial<CodClientError>);
  });

  test("categorizes non-2xx, invalid envelopes, invalid JSON, and an aborted request safely", async () => {
    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(createCodClient({ config: config() }).refreshTransactionStatus({ outTradeNo: "COD-1" })).rejects.toMatchObject({
      category: "http",
    } satisfies Partial<CodClientError>);

    globalThis.fetch = (async () => Response.json({ success: true, result: { nonce: "bad", message: "bad" } })) as typeof fetch;
    await expect(createCodClient({ config: config() }).refreshTransactionStatus({ outTradeNo: "COD-1" })).rejects.toMatchObject({
      category: "malformed_response",
    } satisfies Partial<CodClientError>);

    globalThis.fetch = (async () => {
      const currentConfig = config();
      const { iv, ciphertext } = aesCbcEncrypt(Buffer.from("not json", "utf8"), currentConfig.aesKey, Buffer.alloc(16, 3));
      return Response.json({ success: true, result: { nonce: encodeBase64(iv), message: encodeBase64(ciphertext) } });
    }) as typeof fetch;
    await expect(createCodClient({ config: config() }).refreshTransactionStatus({ outTradeNo: "COD-1" })).rejects.toMatchObject({
      category: "malformed_response",
    } satisfies Partial<CodClientError>);

    globalThis.fetch = ((_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    await expect(
      createCodClient({ config: config(), timeoutMs: 1 }).refreshTransactionStatus({ outTradeNo: "COD-1" }),
    ).rejects.toMatchObject({ category: "timeout" } satisfies Partial<CodClientError>);
  });
});
