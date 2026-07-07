import { describe, expect, test } from "bun:test";

import {
  getFaqById,
  getFaqsByCategory,
  helpCategoryLabels,
  helpFaqs,
} from "./faq";

describe("help FAQ data", () => {
  test("has stable unique ids", () => {
    const ids = helpFaqs.map((faq) => faq.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });

  test("has complete bilingual content and keywords", () => {
    for (const faq of helpFaqs) {
      expect(faq.question["zh-HK"].trim().length).toBeGreaterThan(0);
      expect(faq.question.en.trim().length).toBeGreaterThan(0);
      expect(faq.answer["zh-HK"].trim().length).toBeGreaterThan(0);
      expect(faq.answer.en.trim().length).toBeGreaterThan(0);
      expect(faq.keywords["zh-HK"].length).toBeGreaterThanOrEqual(2);
      expect(faq.keywords.en.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("defines labels for every category used by FAQs", () => {
    const categories = new Set(helpFaqs.map((faq) => faq.category));
    for (const category of categories) {
      expect(helpCategoryLabels[category]["zh-HK"]).toBeTruthy();
      expect(helpCategoryLabels[category].en).toBeTruthy();
    }
  });

  test("marks tax and receipt content as sensitive", () => {
    const receiptFaqs = getFaqsByCategory("tax_receipt");
    expect(receiptFaqs.length).toBeGreaterThanOrEqual(2);
    expect(receiptFaqs.every((faq) => faq.sensitive)).toBe(true);
  });

  test("provides useful CTA routes for public next steps", () => {
    expect(getFaqById("sponsorship-start")?.cta?.href).toBe("/sponsors/pledge");
    expect(getFaqById("adoption-apply")?.cta?.href).toBe("/adoption/apply");
    expect(getFaqById("donation-methods")?.cta?.href).toBe("/donate");
    expect(getFaqById("contact-staff")?.cta?.href).toBe("#contact");
  });

  test("uses clean Traditional Chinese category labels", () => {
    expect(helpCategoryLabels.sponsorship["zh-HK"]).toBe("助養");
    expect(helpCategoryLabels.adoption["zh-HK"]).toBe("領養");
    expect(helpCategoryLabels.tax_receipt["zh-HK"]).toBe("報稅收據");
    expect(helpCategoryLabels.donation["zh-HK"]).toBe("捐款");
    expect(helpCategoryLabels.contact["zh-HK"]).toBe("聯絡職員");
  });

  test("uses clean Traditional Chinese vocabulary in key FAQ copy", () => {
    expect(getFaqById("sponsorship-start")?.question["zh-HK"] ?? "").toContain("助養");
    expect(getFaqById("adoption-apply")?.question["zh-HK"] ?? "").toContain("領養");
    expect(getFaqById("tax-receipt-eligibility")?.question["zh-HK"] ?? "").toContain("報稅");
  });
});
