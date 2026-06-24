import { describe, expect, test } from "bun:test";

import { buildDonationCsv, buildSupporterCsv, escapeCsvValue } from "./csv";

describe("crm csv", () => {
  test("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvValue('Ada, "Cat"\nHK')).toBe('"Ada, ""Cat""\nHK"');
  });

  test("neutralizes spreadsheet formula prefixes", () => {
    expect(escapeCsvValue("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(escapeCsvValue("+85291234567")).toBe("'+85291234567");
    expect(escapeCsvValue("-100")).toBe("'-100");
    expect(escapeCsvValue("@name")).toBe("'@name");
    expect(escapeCsvValue("\tTabbed")).toBe("'\tTabbed");
  });

  test("builds supporter export columns", () => {
    const csv = buildSupporterCsv([
      {
        id: "s1",
        name: "Ada",
        email: "ada@example.com",
        phone: null,
        language: "zh-HK",
        tags: ["medical"],
        roles: ["donor"],
        deletedAt: null,
        lastGiftAt: "2026-06-01T00:00:00.000Z",
        lastGiftAmountCents: 10000,
        lifetimeAmountCents: 30000,
        donationCount: 2,
        receiptNeeded: true,
        emailConsent: "opt_in",
        whatsappConsent: "opt_out",
      },
    ]);

    expect(csv.split("\n")[0]).toBe(
      "supporter_id,name,email,phone,language,roles,tags,lifetime_hkd,last_gift_hkd,last_gift_at,donation_count,receipt_needed,email_consent,whatsapp_consent,deleted_at",
    );
    expect(csv).toContain("300.00");
  });

  test("builds donation export columns", () => {
    const csv = buildDonationCsv([
      {
        supporterId: "s1",
        supporterName: "Ada",
        supporterEmail: "ada@example.com",
        donationId: "d1",
        amountCents: 10000,
        purpose: "general",
        status: "succeeded",
        method: "manual",
        receiptRequested: true,
        receiptNo: "HKSCDA-2026-000001",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ]);

    expect(csv).toContain("receipt_no");
    expect(csv).toContain("HKSCDA-2026-000001");
  });
});
