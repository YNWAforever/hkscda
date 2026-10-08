import { describe, expect, test } from "bun:test";

import type { HelpFaq } from "./faq";
import { describeHelpOutcome } from "./outcome";
import { searchHelpFaqs } from "./search";

const faqs: HelpFaq[] = [
  {
    id: "visit-hours",
    category: "contact",
    question: { "zh-HK": "幾時可以探訪收容所？", en: "When can I visit the shelter?" },
    answer: { "zh-HK": "探訪需預約。", en: "Visits are by appointment. Bring a photo ID." },
    keywords: { "zh-HK": ["探訪", "預約"], en: ["visit", "appointment"] },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: { "zh-HK": "我要怎樣申請領養？", en: "How do I check on an application?" },
    answer: {
      "zh-HK": "你可先查看可領養動物。",
      en: "Check the application status in your email.",
    },
    keywords: { "zh-HK": ["領養", "申請"], en: ["application"] },
  },
];

function search(query: string) {
  return searchHelpFaqs(query, faqs, { language: "en", limit: 8 });
}

describe("describeHelpOutcome", () => {
  test("high confidence gives a direct answer and nothing else", () => {
    const query = "when can I visit the shelter";
    const response = search(query);
    expect(response.confidence).toBe("high");

    const outcome = describeHelpOutcome(response, query);

    expect(outcome.direct).toBe(response.results[0]);
    expect(outcome.related).toEqual([]);
    expect(outcome.showFallback).toBe(false);
  });

  test("medium confidence gives related answers and no fallback", () => {
    const query = "appointments";
    const response = search(query);
    expect(response.confidence).toBe("medium");

    const outcome = describeHelpOutcome(response, query);

    expect(outcome.direct).toBeUndefined();
    expect(outcome.related).toEqual(response.results);
    expect(outcome.showFallback).toBe(false);
  });

  test("low confidence still lists the weak matches and offers the fallback", () => {
    const query = "photo";
    const response = search(query);
    expect(response.confidence).toBe("low");

    const outcome = describeHelpOutcome(response, query);

    expect(outcome.direct).toBeUndefined();
    expect(outcome.related).toEqual(response.results);
    expect(outcome.showFallback).toBe(true);
  });

  test("no confidence gives no related answers and offers the fallback", () => {
    const query = "parking discount coupon";
    const response = search(query);
    expect(response.confidence).toBe("none");

    const outcome = describeHelpOutcome(response, query);

    expect(outcome.direct).toBeUndefined();
    expect(outcome.related).toEqual([]);
    expect(outcome.showFallback).toBe(true);
  });

  test("a high match on a private-status query still offers the fallback", () => {
    const query = "my application status";
    const response = search(query);
    expect(response.confidence).toBe("high");

    const outcome = describeHelpOutcome(response, query);

    expect(outcome.direct).toBe(response.results[0]);
    expect(outcome.showFallback).toBe(true);
  });

  test("an empty submitted query shows nothing", () => {
    for (const query of ["", "   "]) {
      const outcome = describeHelpOutcome(search(query), query);

      expect(outcome.direct).toBeUndefined();
      expect(outcome.related).toEqual([]);
      expect(outcome.showFallback).toBe(false);
    }
  });
});
