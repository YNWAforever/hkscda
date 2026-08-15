import { randomUUID } from "node:crypto";

import { getCodConfig, type CodConfig } from "./config.server";
import { aesCbcDecrypt, createCodRequestEnvelope, decodeBase64Strict } from "./cod-crypto.server";

// Transport timeout only. COD's checkout order expiry is configured separately
// in create_order; a single status request must not consume the 15-minute donor
// polling window.
const COD_REQUEST_TIMEOUT_MS = 15_000;

export type CodClientErrorCategory =
  | "business"
  | "http"
  | "malformed_response"
  | "timeout"
  | "transport";

export class CodClientError extends Error {
  constructor(
    public readonly category: CodClientErrorCategory,
    public readonly status?: number,
  ) {
    super(`COD ${category.replaceAll("_", " ")} error`);
    this.name = "CodClientError";
  }
}

export type CodPaymentSolution = "WAP" | "PC2MOBILE";

export type CodCreateOrderInput = {
  orderRef: string;
  amount: number;
  subject: string;
  returnUrl: string;
  paymentSolution: CodPaymentSolution;
};

export type CodCreateOrderResult = {
  url: string;
  alipayOrderString: string;
  outTradeNo: string;
};

export type CodOrderDetails = {
  amount: number;
  currency: string;
  wallet: string;
  orderRef: string;
  status: string;
  outTradeNo: string;
  transactionId: string;
  subject: string;
  type: string;
  segmentId: string;
  merchantId: string;
};

export type CodTransactionStatus =
  | "paid"
  | "not_exists"
  | "new"
  | "expired"
  | "canceled"
  | "failed";

type CodClientDependencies = {
  config?: CodConfig;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  requestUuid?: () => string;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asCodClientError(error: unknown): CodClientError {
  if (error instanceof CodClientError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new CodClientError("timeout");
  }
  return new CodClientError("transport");
}

export function createCodClient({
  config = getCodConfig(),
  fetch: fetchImplementation = globalThis.fetch,
  now = () => new Date(),
  requestUuid = randomUUID,
  timeoutMs = COD_REQUEST_TIMEOUT_MS,
}: CodClientDependencies = {}) {
  async function request<T>(service: string, parameters: Record<string, unknown>): Promise<T> {
    const uuid = requestUuid();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
      throw new CodClientError("malformed_response");
    }

    const requestPayload = {
      request_uuid: uuid,
      request_time: String(Math.floor(now().getTime() / 1000)),
      service,
      merchant_id: config.merchantId,
      parameters,
    };
    const envelope = createCodRequestEnvelope({
      merchantId: config.merchantId,
      plaintext: Buffer.from(JSON.stringify(requestPayload), "utf8"),
      aesKey: config.aesKey,
      privateKey: config.privateKey,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImplementation(`${config.apiBase}/v1/service`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new CodClientError("timeout");
      throw asCodClientError(error);
    } finally {
      clearTimeout(timeout);
    }

    let outer: unknown;
    try {
      outer = await response.json();
    } catch {
      throw new CodClientError(response.ok ? "malformed_response" : "http", response.status);
    }
    if (!isRecord(outer)) throw new CodClientError("malformed_response");
    if (outer.success === false) throw new CodClientError("business", response.status);
    if (!response.ok) throw new CodClientError("http", response.status);
    if (outer.success !== true || !isRecord(outer.result)) {
      throw new CodClientError("malformed_response");
    }

    const nonce = requiredString(outer.result.nonce);
    const message = requiredString(outer.result.message);
    if (!nonce || !message) throw new CodClientError("malformed_response");

    try {
      const plaintext = aesCbcDecrypt(
        decodeBase64Strict(message, "COD response message"),
        config.aesKey,
        decodeBase64Strict(nonce, "COD response nonce"),
      ).toString("utf8");
      return JSON.parse(plaintext) as T;
    } catch {
      throw new CodClientError("malformed_response");
    }
  }

  return {
    async createOrder(input: CodCreateOrderInput): Promise<CodCreateOrderResult> {
      const result = await request<unknown>("create_order", {
        order_ref: input.orderRef,
        segment_id: config.segmentId,
        amount: input.amount,
        currency: "HKD",
        subject: input.subject,
        wallet: "ALIPAYHK",
        return_url: input.returnUrl,
        payment_solution: input.paymentSolution,
        timeout: 5,
      });
      if (!isRecord(result)) throw new CodClientError("malformed_response");

      const url = requiredString(result.url);
      const alipayOrderString = requiredString(result.alipay_order_string);
      const outTradeNo = requiredString(result.out_trade_no);
      if (!url || !alipayOrderString || !outTradeNo) {
        throw new CodClientError("malformed_response");
      }
      return { url, alipayOrderString, outTradeNo };
    },

    async refreshTransactionStatus({ outTradeNo }: { outTradeNo: string }) {
      const result = await request<unknown>("refresh_transaction_status", {
        out_trade_no: outTradeNo,
        segment_id: config.segmentId,
        request_details: true,
      });
      if (!isRecord(result) || typeof result.status !== "string") {
        throw new CodClientError("malformed_response");
      }
      const statuses: ReadonlySet<string> = new Set([
        "paid",
        "not_exists",
        "new",
        "expired",
        "canceled",
        "failed",
      ]);
      if (!statuses.has(result.status)) throw new CodClientError("malformed_response");
      return { status: result.status as CodTransactionStatus };
    },

    // COD documents out_trade_no as unsupported for transaction_details.
    // order_details is the supported lookup for the order_ref we persisted at
    // checkout and returns the same payment identity fields needed for binding.
    async getOrderDetails({ orderRef }: { orderRef: string }): Promise<CodOrderDetails> {
      const result = await request<unknown>("order_details", { order_ref: orderRef });
      if (
        !isRecord(result) ||
        typeof result.amount !== "number" ||
        !Number.isFinite(result.amount)
      ) {
        throw new CodClientError("malformed_response");
      }

      const details = {
        amount: result.amount,
        currency: requiredString(result.currency),
        wallet: requiredString(result.wallet),
        orderRef: requiredString(result.order_ref),
        status: requiredString(result.status),
        outTradeNo: requiredString(result.out_trade_no),
        transactionId: requiredString(result.transaction_id),
        subject: requiredString(result.subject),
        type: requiredString(result.type),
        segmentId: requiredString(result.segment_id),
        merchantId: requiredString(result.merchant_id),
      };
      if (Object.values(details).some((value) => value === null)) {
        throw new CodClientError("malformed_response");
      }
      return details as CodOrderDetails;
    },
  };
}
