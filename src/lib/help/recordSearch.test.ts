import { expect, mock, test } from "bun:test";

import type { trackHelpEvent } from "./analytics";
import type { HelpFaq } from "./faq";
import { recordHelpSearch } from "./recordSearch";
import type { HelpSearchResponse } from "./search";
import type { reportSearchGap } from "./searchGapBeacon";

const faq: HelpFaq = {
  id: "adoption-fee",
  category: "adoption",
  question: { "zh-HK": "領養費用", en: "Adoption fee" },
  answer: { "zh-HK": "答案", en: "Answer" },
  keywords: { "zh-HK": [], en: [] },
};

test("recordHelpSearch tracks the search once and reports the gap once", () => {
  const track = mock<typeof trackHelpEvent>(() => {});
  const reportGap = mock<typeof reportSearchGap>(() => {});
  const response: HelpSearchResponse = {
    query: "Adoption Fee?",
    normalizedQuery: "adoption fee",
    confidence: "low",
    results: [
      { faq, score: 3, matchedFields: ["question"] },
      { faq, score: 2, matchedFields: ["keywords"] },
    ],
  };

  recordHelpSearch({ query: "Adoption Fee?", language: "en", response }, { track, reportGap });

  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith("help_search", {
    language: "en",
    resultCount: 2,
    confidenceBucket: "low",
    query: "Adoption Fee?",
  });
  expect(reportGap).toHaveBeenCalledTimes(1);
  expect(reportGap).toHaveBeenCalledWith({
    query: "Adoption Fee?",
    language: "en",
    confidence: "low",
  });
});
