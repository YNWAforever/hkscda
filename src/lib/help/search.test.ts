import { describe, expect, test } from "bun:test";

import { normalizeHelpQuery, requiresStaffContact, searchHelpFaqs } from "./search";
import type { HelpFaq } from "./faq";

const testFaqs: HelpFaq[] = [
  {
    id: "sponsorship-start",
    category: "sponsorship",
    question: {
      "zh-HK": "我想開始助養，下一步要怎麼做？",
      en: "I want to start sponsoring. What should I do next?",
    },
    answer: { "zh-HK": "先選擇你想支持的動物。", en: "Choose your preferred sponsor animals first." },
    keywords: {
      "zh-HK": ["助養", "開始", "申請"],
      en: ["start sponsorship", "pledge form", "payment proof"],
    },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: { "zh-HK": "我要怎樣申請領養？", en: "How do I apply to adopt a cat or dog?" },
    answer: { "zh-HK": "你可先查看可領養動物。", en: "Browse adoptable animals." },
    keywords: { "zh-HK": ["領養", "申請"], en: ["adopt", "adoption", "apply", "cat", "dog"] },
  },
  {
    id: "tax-receipt-eligibility",
    category: "tax_receipt",
    question: { "zh-HK": "我可以為捐款申請報稅收據嗎？", en: "Can I request a tax receipt for my donation?" },
    answer: { "zh-HK": "HKSCDA 是持牌慈善機構。", en: "HKSCDA is an approved charitable institution." },
    keywords: { "zh-HK": ["報稅", "捐款", "收據", "IRD", "88條"], en: ["tax", "receipt", "IRD", "Section 88"] },
    sensitive: true,
  },
  {
    id: "donation-methods",
    category: "donation",
    question: { "zh-HK": "有哪些捐款方式？", en: "What donation methods are available?" },
    answer: { "zh-HK": "捐款頁只會顯示已啟用的方式。", en: "The donation page shows active methods." },
    keywords: { "zh-HK": ["捐款", "FPS", "PayMe", "PayPal"], en: ["donate", "FPS", "PayMe", "PayPal"] },
  },
  {
    id: "contact-staff",
    category: "contact",
    question: { "zh-HK": "如何聯絡職員？", en: "How can I contact staff?" },
    answer: { "zh-HK": "可透過 WhatsApp／電話聯絡。", en: "You can contact HKSCDA by WhatsApp / phone." },
    keywords: { "zh-HK": ["聯絡職員", "WhatsApp", "電話"], en: ["contact", "WhatsApp", "phone", "staff"] },
  },
];

describe("help FAQ search", () => {
  test("normalizes English and whitespace without stripping Chinese", () => {
    expect(normalizeHelpQuery("  TAX   Receipt!!  ")).toBe("tax receipt");
    expect(normalizeHelpQuery("  報稅   收據!!  ")).toBe("報稅 收據");
  });

  test("finds sponsorship questions in Chinese", () => {
    const result = searchHelpFaqs("我想開始助養 下一步", testFaqs, { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("sponsorship");
  });

  test("finds adoption questions in English", () => {
    const result = searchHelpFaqs("how do I apply to adopt a dog", testFaqs, { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("adoption-apply");
  });

  test("finds tax receipt questions and keeps them sensitive", () => {
    const result = searchHelpFaqs("報稅收據 IRD 88", testFaqs, { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("tax_receipt");
    expect(result.results[0]?.faq.sensitive).toBe(true);
  });

  test("finds donation method questions", () => {
    const result = searchHelpFaqs("FPS PayMe 捐款", testFaqs, { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("donation-methods");
  });

  test("finds contact fallback questions", () => {
    const result = searchHelpFaqs("WhatsApp phone staff", testFaqs, { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("contact-staff");
  });

  test("returns none for unrelated queries", () => {
    const result = searchHelpFaqs("parking discount coupon", testFaqs, { language: "en" });
    expect(result.confidence).toBe("none");
    expect(result.results).toEqual([]);
  });

  test("respects an empty faqs array (e.g. FAQ content still loading)", () => {
    const result = searchHelpFaqs("助養", [], { language: "zh-HK" });
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
