import { describe, expect, test } from "bun:test";

import { getFaqText, helpCategoryLabels } from "./faq";
import type { HelpFaq } from "./faq";

describe("help FAQ shared types and helpers", () => {
  test("defines a bilingual label for every category", () => {
    for (const category of [
      "sponsorship",
      "adoption",
      "tax_receipt",
      "donation",
      "contact",
    ] as const) {
      expect(helpCategoryLabels[category]["zh-HK"]).toBeTruthy();
      expect(helpCategoryLabels[category].en).toBeTruthy();
    }
  });

  test("uses clean Traditional Chinese category labels", () => {
    expect(helpCategoryLabels.sponsorship["zh-HK"]).toBe("助養");
    expect(helpCategoryLabels.adoption["zh-HK"]).toBe("領養");
    expect(helpCategoryLabels.tax_receipt["zh-HK"]).toBe("報稅收據");
    expect(helpCategoryLabels.donation["zh-HK"]).toBe("捐款");
    expect(helpCategoryLabels.contact["zh-HK"]).toBe("聯絡職員");
  });

  test("getFaqText projects a single language's question/answer/keywords/CTA", () => {
    const faq: HelpFaq = {
      id: "x",
      category: "donation",
      question: { "zh-HK": "問題", en: "Question" },
      answer: { "zh-HK": "答案", en: "Answer" },
      keywords: { "zh-HK": ["捐款"], en: ["donate"] },
      cta: {
        href: "/donate",
        label: { "zh-HK": "捐款", en: "Donate" },
        analyticsAction: "donate_cta",
      },
    };

    expect(getFaqText(faq, "zh-HK")).toEqual({
      question: "問題",
      answer: "答案",
      keywords: ["捐款"],
      cta: { href: "/donate", label: "捐款", analyticsAction: "donate_cta" },
      categoryLabel: "捐款",
    });
  });
});
