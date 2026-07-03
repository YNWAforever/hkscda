import { describe, expect, test } from "bun:test";

import {
  consentUpdateSchema,
  exportSearchSchema,
  manualDonationSchema,
  supporterInputSchema,
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

  test("normalizes empty boolean params as omitted", () => {
    const parsed = supporterSearchSchema.parse({
      receiptNeeded: "",
      includeDeleted: "",
    });

    expect(parsed.receiptNeeded).toBeUndefined();
    expect(parsed.includeDeleted).toBe(false);
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

  test("requires exactly one manual donation supporter identity", () => {
    expect(() =>
      manualDonationSchema.parse({
        supporterId: "8ddfd279-4ba7-4c2b-9e3c-1dbf17bb5ead",
        supporter: { name: "Ada", email: "ada@example.com", language: "zh-HK" },
        amountCents: 10000,
        currency: "HKD",
        purpose: "general",
        method: "manual",
        paymentStatus: "pending",
        receiptRequested: true,
      }),
    ).toThrow("Exactly one");

    expect(() =>
      manualDonationSchema.parse({
        amountCents: 10000,
        currency: "HKD",
        purpose: "general",
        method: "manual",
        paymentStatus: "pending",
        receiptRequested: true,
      }),
    ).toThrow("Exactly one");
  });

  test("normalizes supporter updates", () => {
    const parsed = supporterUpdateSchema.parse({
      name: "  Ada Wong  ",
      phone: "  9123 4567 ",
      language: "en",
      tags: [" major donor ", "", "medical"],
      roles: [" donor ", "volunteer", "donor"],
      deleted: false,
    });

    expect(parsed).toEqual({
      name: "Ada Wong",
      phone: "9123 4567",
      language: "en",
      tags: ["major donor", "medical"],
      roles: ["donor", "volunteer"],
      deleted: false,
    });
  });

  test("normalizes explicit empty supporter update phone to null", () => {
    expect(supporterUpdateSchema.parse({ phone: "" })).toEqual({ phone: null });
    expect(supporterUpdateSchema.parse({ phone: null })).toEqual({ phone: null });
  });

  test("dedupes supporter input tags", () => {
    const parsed = supporterInputSchema.parse({
      name: "Ada",
      email: "ADA@example.com",
      language: "zh-HK",
      tags: [" medical ", "medical", "", " donor "],
      roles: [" volunteer ", "donor", "volunteer"],
    });

    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.tags).toEqual(["medical", "donor"]);
    expect(parsed.roles).toEqual(["volunteer", "donor"]);
  });

  test("defaults manually created supporters to donor when no role is provided", () => {
    const parsed = supporterInputSchema.parse({
      name: "Ada",
      email: "ada@example.com",
      language: "zh-HK",
    });

    expect(parsed.roles).toEqual(["donor"]);
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
