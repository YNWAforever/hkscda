import { describe, expect, test } from "bun:test";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
} from "./schemas";

describe("paymentPublicConfigDraftInputSchema", () => {
  test("accepts a complete valid draft", () => {
    const result = paymentPublicConfigDraftInputSchema.parse({
      method: "fps",
      isPubliclyVisible: true,
      displayLabelZh: "轉數快 FPS",
      displayLabelEn: "FPS",
      sortOrder: 2,
      details: { note: "測試" },
    });
    expect(result.method).toBe("fps");
    expect(result.details).toEqual({ note: "測試" });
  });

  test("defaults isPubliclyVisible to false and details to an empty object", () => {
    const result = paymentPublicConfigDraftInputSchema.parse({
      method: "stripe",
      displayLabelZh: "信用卡",
      displayLabelEn: "Card",
    });
    expect(result.isPubliclyVisible).toBe(false);
    expect(result.details).toEqual({});
    expect(result.sortOrder).toBe(0);
  });

  test("rejects an unknown method", () => {
    expect(() =>
      paymentPublicConfigDraftInputSchema.parse({
        method: "bank_transfer",
        displayLabelZh: "銀行轉帳",
        displayLabelEn: "Bank transfer",
      }),
    ).toThrow();
  });

  test("rejects an empty display label", () => {
    expect(() =>
      paymentPublicConfigDraftInputSchema.parse({
        method: "stripe",
        displayLabelZh: "",
        displayLabelEn: "Card",
      }),
    ).toThrow();
  });
});

describe("paymentPublicConfigMutationSchema", () => {
  test("requires expectedVersion in addition to the draft fields", () => {
    expect(() =>
      paymentPublicConfigMutationSchema.parse({
        method: "stripe",
        displayLabelZh: "信用卡",
        displayLabelEn: "Card",
      }),
    ).toThrow();

    const result = paymentPublicConfigMutationSchema.parse({
      method: "stripe",
      displayLabelZh: "信用卡",
      displayLabelEn: "Card",
      expectedVersion: 3,
    });
    expect(result.expectedVersion).toBe(3);
  });
});

describe("paymentPublicConfigPublishSchema", () => {
  test("rejects an idempotency key shorter than 16 characters", () => {
    expect(() =>
      paymentPublicConfigPublishSchema.parse({ expectedVersion: 1, idempotencyKey: "short" }),
    ).toThrow();
  });

  test("accepts a valid publish payload", () => {
    const result = paymentPublicConfigPublishSchema.parse({
      expectedVersion: 1,
      idempotencyKey: "a".repeat(32),
    });
    expect(result.expectedVersion).toBe(1);
  });
});
