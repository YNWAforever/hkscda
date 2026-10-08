import { describe, expect, test } from "bun:test";

import { buildTesterFaqs } from "./answerTester";
import { resolveFaqCta } from "./schemas";
import type { FaqEntry, FaqEntryInput } from "./types";

function entry(overrides: Partial<FaqEntry> & Pick<FaqEntry, "id">): FaqEntry {
  return {
    category: "adoption",
    question: { "zh-HK": "我要怎樣申請領養？", en: "How do I apply to adopt?" },
    answer: { "zh-HK": "你可先查看可領養動物。", en: "Browse adoptable animals." },
    keywords: { "zh-HK": ["領養"], en: ["adopt"] },
    ctaKey: null,
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function draftInput(overrides: Partial<FaqEntryInput> = {}): FaqEntryInput {
  return {
    category: "donation",
    questionZh: "有哪些捐款方式？",
    questionEn: "What donation methods are available?",
    answerZh: "請到捐款頁。",
    answerEn: "Please visit the donation page.",
    keywordsZh: ["捐款"],
    keywordsEn: ["donate"],
    ctaKey: null,
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

describe("buildTesterFaqs", () => {
  test("excludes inactive entries", () => {
    const { faqs, draftHidden } = buildTesterFaqs(
      [entry({ id: "active" }), entry({ id: "inactive", isActive: false })],
      null,
    );

    expect(faqs.map((faq) => faq.id)).toEqual(["active"]);
    expect(draftHidden).toBe(false);
  });

  test("appends a draft without an id under the id draft", () => {
    const { faqs } = buildTesterFaqs([entry({ id: "active" })], draftInput());

    expect(faqs.map((faq) => faq.id)).toEqual(["active", "draft"]);
    expect(faqs[1]?.question).toEqual({
      "zh-HK": "有哪些捐款方式？",
      en: "What donation methods are available?",
    });
    expect(faqs[1]?.keywords).toEqual({ "zh-HK": ["捐款"], en: ["donate"] });
  });

  test("a draft carrying an existing id replaces that entry without duplicating it", () => {
    const { faqs } = buildTesterFaqs(
      [entry({ id: "first" }), entry({ id: "second" })],
      draftInput({ id: "first", questionEn: "Edited question" }),
    );

    expect(faqs.map((faq) => faq.id)).toEqual(["first", "second"]);
    expect(faqs[0]?.question.en).toBe("Edited question");
  });

  test("a draft for an inactive entry is added rather than duplicated", () => {
    const { faqs } = buildTesterFaqs(
      [entry({ id: "retired", isActive: false })],
      draftInput({ id: "retired" }),
    );

    expect(faqs.map((faq) => faq.id)).toEqual(["retired"]);
  });

  test("draftHidden is true exactly when the draft is set to hidden", () => {
    const entries = [entry({ id: "active" })];

    expect(buildTesterFaqs(entries, draftInput({ isActive: false })).draftHidden).toBe(true);
    expect(buildTesterFaqs(entries, draftInput({ isActive: true })).draftHidden).toBe(false);
    expect(buildTesterFaqs(entries, null).draftHidden).toBe(false);
  });

  test("a hidden draft is still tested, so staff can see how it would match once shown", () => {
    const { faqs, draftHidden } = buildTesterFaqs([], draftInput({ isActive: false }));

    expect(faqs.map((faq) => faq.id)).toEqual(["draft"]);
    expect(draftHidden).toBe(true);
  });

  test("the draft's ctaKey maps through resolveFaqCta", () => {
    const { faqs } = buildTesterFaqs([], draftInput({ ctaKey: "view_donation_methods" }));

    expect(faqs[0]?.cta).toEqual(resolveFaqCta("view_donation_methods"));
    expect(faqs[0]?.cta).toBeDefined();
  });
});
