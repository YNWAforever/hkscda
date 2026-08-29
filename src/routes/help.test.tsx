import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { HelpFaq } from "../lib/help/faq";
import { HelpFaqDirectory } from "./help";
import { HelpSearch } from "../components/site/help/HelpSearch";

const testFaqs: HelpFaq[] = [
  {
    id: "sponsorship-how-it-works",
    category: "sponsorship",
    question: { "zh-HK": "助養運作方式是什麼？", en: "How does sponsorship work?" },
    answer: { "zh-HK": "答案", en: "Answer" },
    keywords: { "zh-HK": ["助養"], en: ["sponsor"] },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: { "zh-HK": "我要怎樣申請領養？", en: "How do I apply to adopt a cat or dog?" },
    answer: { "zh-HK": "答案", en: "Answer" },
    keywords: { "zh-HK": ["領養"], en: ["adopt"] },
  },
];

describe("HelpFaqDirectory", () => {
  test("renders every provided FAQ entry for browsing", () => {
    const markup = renderToStaticMarkup(
      <>
        <HelpSearch language="zh-HK" faqs={testFaqs} surface="page" />
        <HelpFaqDirectory language="zh-HK" faqs={testFaqs} />
      </>,
    );

    expect(markup).toContain('aria-label="搜尋常見問題"');

    for (const faq of testFaqs) {
      expect(markup).toContain(faq.question["zh-HK"]);
    }
  });

  test("renders nothing for a category with no active entries", () => {
    const markup = renderToStaticMarkup(<HelpFaqDirectory language="zh-HK" faqs={[]} />);
    expect(markup.match(/0 條/g)).toHaveLength(5);
    expect(markup).not.toContain("<article");
  });
});
