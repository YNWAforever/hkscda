import { describe, expect, test } from "bun:test";

import {
  consentUpdateSchema,
  exportSearchSchema,
  manualDonationSchema,
  supporterSearchSchema,
  supporterUpdateSchema,
} from "./schemas";

describe("crm schemas", () => {
  test("normalizes supporter search params", () => {
    const parsed = supporterSearchSchema.parse({
      q: "  Ada  ",
      page: "2",
      pageSize: "50",
      role: "donor",
      receiptNeeded: "true",
      includeDeleted: "false",
    });

    expect(parsed).toEqual({
      q: "Ada",
      page: 2,
      pageSize: 50,
      role: "donor",
      tag: undefined,
      consentChannel: undefined,
      consentStatus: undefined,
      receiptNeeded: true,
      purpose: undefined,
      includeDeleted: false,
    });
  });

  test("rejects unsupported manual donation method", () => {
    expect(() =>
      manualDonationSchema.parse({
        supporter: { name: "Ada", email: "ada@example.com", language: "zh-HK" },
        amountCents: 10000,
        currency: "HKD",
        purpose: "medical",
        method: "stripe",
        paymentStatus: "succeeded",
        bankReference: "FPS-123",
        receiptRequested: true,
        consents: { email: true, whatsapp: false },
      }),
    ).toThrow();
  });

  test("requires bank reference when manual donation is immediately succeeded", () => {
    expect(() =>
      manualDonationSchema.parse({
        supporter: { name: "Ada", email: "ada@example.com", language: "zh-HK" },
        amountCents: 10000,
        currency: "HKD",
        purpose: "general",
        method: "manual",
        paymentStatus: "succeeded",
        receiptRequested: true,
        consents: { email: true, whatsapp: true },
      }),
    ).toThrow("bankReference");
  });

  test("normalizes supporter updates", () => {
    const parsed = supporterUpdateSchema.parse({
      name: "  Ada Wong  ",
      phone: "  9123 4567 ",
      language: "en",
      tags: [" major donor ", "", "medical"],
      deleted: false,
    });

    expect(parsed).toEqual({
      name: "Ada Wong",
      phone: "9123 4567",
      language: "en",
      tags: ["major donor", "medical"],
      deleted: false,
    });
  });

  test("accepts partial channel consent updates", () => {
    const parsed = consentUpdateSchema.parse({
      source: "phone_call",
      email: true,
      whatsapp: false,
      timestamp: "2026-06-24T09:00:00.000Z",
    });

    expect(parsed.source).toBe("phone_call");
    expect(parsed.email).toBe(true);
    expect(parsed.whatsapp).toBe(false);
  });

  test("normalizes export filters with default scope", () => {
    const parsed = exportSearchSchema.parse({
      q: " receipt ",
      purpose: "sponsor",
    });

    expect(parsed.q).toBe("receipt");
    expect(parsed.purpose).toBe("sponsor");
    expect(parsed.includeDeleted).toBe(false);
  });
});
