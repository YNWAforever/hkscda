import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { HelpFaq } from "../../../lib/help/faq";
import { FaqResultCard } from "./FaqResultCard";

describe("FaqResultCard", () => {
  test("does not clamp sensitive approved answers in the compact widget", () => {
    const faq: HelpFaq = {
      id: "tax-receipt-eligibility",
      category: "tax_receipt",
      question: {
        "zh-HK": "我可以為捐款申請報稅收據嗎？",
        en: "Can I request a tax receipt for my donation?",
      },
      answer: {
        "zh-HK":
          "HKSCDA 是持牌慈善機構。一般來說，捐款金額在 HK$100 或以上即可申請報稅收據。此助理只會提供收據流程，不能提供個人稅務意見。",
        en: "HKSCDA is an approved charitable institution. In general, donations of HK$100 or above can request an IRD Section 88 charitable donation receipt through the receipt process. This help assistant only explains the receipt process and cannot provide personal tax advice.",
      },
      keywords: {
        "zh-HK": ["報稅", "捐款", "收據", "IRD", "88條", "申請", "條件"],
        en: ["tax", "receipt", "IRD", "Section 88", "charity", "HK$100", "deduction"],
      },
      cta: {
        href: "/donate",
        label: { "zh-HK": "查看捐款收據", en: "Get donation receipt info" },
        analyticsAction: "open_donation_for_receipt",
      },
      sensitive: true,
    };

    const markup = renderToStaticMarkup(<FaqResultCard faq={faq} language="en" compact />);

    expect(markup).toContain("cannot provide personal tax advice");
    expect(markup).not.toContain("line-clamp-4");
  });
});
