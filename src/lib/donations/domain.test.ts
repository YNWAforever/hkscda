import { describe, expect, test } from "bun:test";

import {
  buildConsentRows,
  centsToHkd,
  createManualPaymentReference,
  donationRequestSchema,
  formatReceiptNumber,
  isReceiptEligible,
} from "./domain";
import type { DonationAttribution } from "./attribution";

describe("donation domain", () => {
  test("normalizes valid HKD donation requests", () => {
    const parsed = donationRequestSchema.parse({
      amountCents: 30000,
      currency: "HKD",
      purpose: "medical",
      method: "stripe",
      receiptRequested: true,
      donor: {
        name: "  陳 小明  ",
        email: " DONOR@Example.COM ",
        phone: " 9123 4567 ",
        language: "zh-HK",
      },
      consents: {
        email: true,
        whatsapp: false,
      },
    });

    expect(parsed.amountCents).toBe(30000);
    expect(parsed.donor.name).toBe("陳 小明");
    expect(parsed.donor.email).toBe("donor@example.com");
    expect(parsed.donor.phone).toBe("9123 4567");
  });

  test("normalizes and bounds an optional custom purpose", () => {
    const validRequest = {
      amountCents: 30000,
      currency: "HKD",
      purpose: "medical",
      method: "stripe",
      receiptRequested: true,
      donor: { name: "Ada", email: "ada@example.com", language: "en" },
      consents: { email: true, whatsapp: false },
    };

    expect(
      donationRequestSchema.parse({
        ...validRequest,
        customPurpose: "  婚宴回禮  ",
      }).customPurpose,
    ).toBe("婚宴回禮");
    expect(
      donationRequestSchema.parse({
        ...validRequest,
        customPurpose: "   ",
      }).customPurpose,
    ).toBeUndefined();
    expect(() =>
      donationRequestSchema.parse({
        ...validRequest,
        customPurpose: "個案\nA",
      }),
    ).toThrow();
    expect(() =>
      donationRequestSchema.parse({
        ...validRequest,
        customPurpose: "個案 A\n",
      }),
    ).toThrow();
    expect(() =>
      donationRequestSchema.parse({ ...validRequest, customPurpose: "\t個案 A" }),
    ).toThrow();
    expect(() =>
      donationRequestSchema.parse({
        ...validRequest,
        customPurpose: "A".repeat(201),
      }),
    ).toThrow();
  });

  test("accepts controlled donation attribution and rejects unknown contexts", () => {
    const attribution = {
      source: "contextual-cta",
      context: "animal",
      purpose: "medical",
      placement: "mobile-bottom",
      trigger: "scroll",
    } satisfies DonationAttribution;
    const input = {
      amountCents: 30000,
      currency: "HKD",
      purpose: "medical",
      method: "stripe",
      receiptRequested: true,
      donor: { name: "Ada", email: "ada@example.com", language: "en" },
      consents: { email: true, whatsapp: false },
      attribution,
    };

    expect(donationRequestSchema.parse(input).attribution).toEqual(attribution);
    expect(() =>
      donationRequestSchema.parse({
        ...input,
        attribution: { ...attribution, context: "unknown" },
      }),
    ).toThrow();
  });
  test("rejects non-integer money and unsupported currency", () => {
    expect(() =>
      donationRequestSchema.parse({
        amountCents: 100.5,
        currency: "USD",
        purpose: "general",
        method: "fps",
        receiptRequested: false,
        donor: { name: "Ada", email: "ada@example.com", language: "en" },
        consents: { email: true, whatsapp: false },
      }),
    ).toThrow();
  });

  test("creates stable manual references from donation ids", () => {
    expect(createManualPaymentReference("f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a")).toBe(
      "HKSCDA-F8DCE8FA",
    );
  });

  test("only requested donations of HK$100 or more are receipt eligible", () => {
    expect(isReceiptEligible({ amountCents: 10000, receiptRequested: true })).toBe(true);
    expect(isReceiptEligible({ amountCents: 9999, receiptRequested: true })).toBe(false);
    expect(isReceiptEligible({ amountCents: 20000, receiptRequested: false })).toBe(false);
  });

  test("renders the exact charged amount, including cents", () => {
    // Whole-dollar gifts show no decimals; fractional gifts show the real cents
    // so a tax receipt never rounds away part of what was charged.
    expect(centsToHkd(15050)).toContain("150.50");
    expect(centsToHkd(10000)).not.toContain(".0");
    expect(centsToHkd(10001)).toContain("100.01");
  });

  test("formats sequential IRD receipt numbers", () => {
    expect(formatReceiptNumber(2026, 1)).toBe("HKSCDA-2026-000001");
    expect(formatReceiptNumber(2026, 123)).toBe("HKSCDA-2026-000123");
  });

  test("builds separate channel consent rows with timestamps and source", () => {
    const rows = buildConsentRows({
      supporterId: "supporter-1",
      source: "donation_form",
      timestamp: "2026-06-24T10:00:00.000Z",
      consents: { email: true, whatsapp: false },
    });

    expect(rows).toEqual([
      {
        supporter_id: "supporter-1",
        channel: "email",
        status: "opt_in",
        source: "donation_form",
        timestamp: "2026-06-24T10:00:00.000Z",
      },
      {
        supporter_id: "supporter-1",
        channel: "whatsapp",
        status: "opt_out",
        source: "donation_form",
        timestamp: "2026-06-24T10:00:00.000Z",
      },
    ]);
  });
});
