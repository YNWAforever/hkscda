import { describe, expect, test } from "bun:test";

import { normalizeHelpQuery, requiresStaffContact, searchHelpFaqs } from "./search";

describe("help FAQ search", () => {
  test("normalizes English and whitespace without stripping Chinese", () => {
    expect(normalizeHelpQuery("  TAX   Receipt!!  ")).toBe("tax receipt");
    expect(normalizeHelpQuery("  報稅   收據!!  ")).toBe("報稅 收據");
  });

  test("finds sponsorship questions in Chinese", () => {
    const result = searchHelpFaqs("我想開始助養 下一步", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("sponsorship");
  });

  test("finds adoption questions in English", () => {
    const result = searchHelpFaqs("how do I apply to adopt a dog", { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("adoption-apply");
  });

  test("finds tax receipt questions and keeps them sensitive", () => {
    const result = searchHelpFaqs("報稅收據 IRD 88", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("tax_receipt");
    expect(result.results[0]?.faq.sensitive).toBe(true);
  });

  test("finds donation method questions", () => {
    const result = searchHelpFaqs("FPS PayMe 捐款", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("donation-methods");
  });

  test("finds contact fallback questions", () => {
    const result = searchHelpFaqs("WhatsApp phone staff", { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("contact-staff");
  });

  test("returns none for unrelated queries", () => {
    const result = searchHelpFaqs("parking discount coupon", { language: "en" });
    expect(result.confidence).toBe("none");
    expect(result.results).toEqual([]);
  });

  test("detects private status queries that should offer staff contact", () => {
    expect(requiresStaffContact("what is my adoption application status")).toBe(true);
    expect(requiresStaffContact("我的領養申請進度")).toBe(true);
    expect(requiresStaffContact("付款編號 ABC12345")).toBe(true);
    expect(requiresStaffContact("FPS PayMe 捐款方法")).toBe(false);
    expect(requiresStaffContact("報稅收據資格")).toBe(false);
  });
});
