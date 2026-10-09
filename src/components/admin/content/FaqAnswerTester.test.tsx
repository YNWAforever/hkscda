import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { HelpFaq } from "../../../lib/faq/types";
import { FaqAnswerTester } from "./FaqAnswerTester";

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

type Props = Parameters<typeof FaqAnswerTester>[0];

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(
    <FaqAnswerTester
      faqs={faqs}
      draftHidden={false}
      query=""
      language="zh-HK"
      onQueryChange={() => {}}
      onLanguageChange={() => {}}
      {...overrides}
    />,
  );
}

// Visible text only, so assertions do not depend on the element structure.
function textOf(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

describe("FaqAnswerTester", () => {
  test("a matching query shows the confidence, the direct answer and the matched question", () => {
    const text = textOf(render({ query: "探訪收容所", language: "zh-HK" }));

    expect(text).toContain("配對程度：高");
    expect(text).toContain("直接答案");
    expect(text).toContain("幾時可以探訪收容所？");
    expect(text).not.toContain("轉介職員");
  });

  test("a weaker match lists related answers and offers the contact fallback", () => {
    const text = textOf(render({ query: "photo", language: "en" }));

    expect(text).toContain("配對程度：低");
    expect(text).toContain("相關答案");
    expect(text).toContain("轉介職員");
    expect(text).toContain("When can I visit the shelter?");
  });

  test("a medium match lists related answers without the fallback", () => {
    const text = textOf(render({ query: "appointments", language: "en" }));

    expect(text).toContain("配對程度：中");
    expect(text).toContain("相關答案");
    expect(text).not.toContain("轉介職員");
  });

  test("a non-matching query shows the contact fallback and no matched question", () => {
    const text = textOf(render({ query: "parking discount coupon", language: "en" }));

    expect(text).toContain("配對程度：沒有");
    expect(text).toContain("轉介職員");
    expect(text).not.toContain("直接答案");
    expect(text).not.toContain("相關答案");
    expect(text).not.toContain("When can I visit the shelter?");
  });

  test("a private-status query says the visitor would be sent to staff", () => {
    const text = textOf(render({ query: "my application status", language: "en" }));

    expect(text).toContain("直接答案");
    expect(text).toContain("轉介職員");
    expect(text).toContain("此問題會建議訪客聯絡職員");
  });

  test("an ordinary query does not mention the staff-contact rule", () => {
    expect(textOf(render({ query: "探訪收容所" }))).not.toContain("此問題會建議訪客聯絡職員");
  });

  test("an empty query shows no result area", () => {
    for (const query of ["", "   "]) {
      const text = textOf(render({ query }));

      expect(text).not.toContain("配對程度");
      expect(text).not.toContain("直接答案");
      expect(text).not.toContain("轉介職員");
    }
  });

  test("matched questions follow the chosen language", () => {
    const english = textOf(render({ query: "visit the shelter", language: "en" }));
    expect(english).toContain("When can I visit the shelter?");
    expect(english).not.toContain("幾時可以探訪收容所？");

    const chinese = textOf(render({ query: "探訪收容所", language: "zh-HK" }));
    expect(chinese).toContain("幾時可以探訪收容所？");
    expect(chinese).not.toContain("When can I visit the shelter?");
  });

  test("a hidden draft shows the note, and an ordinary draft does not", () => {
    expect(textOf(render({ draftHidden: true }))).toContain(
      "此草稿目前設為不顯示，訪客在啟用前不會看到。",
    );
    expect(textOf(render({ draftHidden: false }))).not.toContain("此草稿目前設為不顯示");
  });

  test("the 5-minute cache line is always shown", () => {
    const line = "已發佈的修改最多需要 5 分鐘才會在訪客的頁面上出現。";

    expect(textOf(render())).toContain(line);
    expect(textOf(render({ query: "探訪收容所", draftHidden: true }))).toContain(line);
  });

  test("the input shows the query and the chosen language is selected", () => {
    const markup = render({ query: "助養", language: "en" });

    expect(markup).toContain('value="助養"');
    const radios = [...markup.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => ({
      value: /value="([^"]*)"/.exec(match[0])?.[1],
      checked: match[0].includes("checked"),
    }));
    expect(radios).toEqual([
      { value: "zh-HK", checked: false },
      { value: "en", checked: true },
    ]);
  });
});
