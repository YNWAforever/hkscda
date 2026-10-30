import { describe, expect, test } from "bun:test";

import { createPaymentRetryKey, submitWithPaymentRetryKey } from "./paymentRetry";

function sequentialKeys() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("submitWithPaymentRetryKey", () => {
  test("a retry of the same failed payment reuses its idempotency key", async () => {
    const retry = createPaymentRetryKey(sequentialKeys());
    const sent: string[] = [];
    const fail = async (key: string) => {
      sent.push(key);
      throw new Error("network");
    };

    await expect(submitWithPaymentRetryKey(retry, "same-facts", fail)).rejects.toThrow("network");
    await expect(submitWithPaymentRetryKey(retry, "same-facts", fail)).rejects.toThrow("network");

    expect(sent).toEqual(["key-1", "key-1"]);
  });

  test("changed facts get a new idempotency key", async () => {
    const retry = createPaymentRetryKey(sequentialKeys());
    const sent: string[] = [];
    const fail = async (key: string) => {
      sent.push(key);
      throw new Error("network");
    };

    await expect(submitWithPaymentRetryKey(retry, "facts-a", fail)).rejects.toThrow();
    await expect(submitWithPaymentRetryKey(retry, "facts-b", fail)).rejects.toThrow();

    expect(sent).toEqual(["key-1", "key-2"]);
  });

  test("BUG-45: a second identical payment after a successful one gets a new idempotency key", async () => {
    const retry = createPaymentRetryKey(sequentialKeys());
    const sent: string[] = [];
    const record = async (key: string) => {
      sent.push(key);
      return { id: key };
    };

    // The supporter pays HK$300 by FPS on the same date twice; staff enter the same facts.
    await submitWithPaymentRetryKey(retry, "fps-30000-2026-10-01", record);
    await submitWithPaymentRetryKey(retry, "fps-30000-2026-10-01", record);

    expect(sent).toEqual(["key-1", "key-2"]);
  });
});
