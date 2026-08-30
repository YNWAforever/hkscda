import { describe, expect, test } from "bun:test";
import { toInput } from "./FaqManagement";

const baseDraft = {
  category: "sponsorship" as const,
  questionZh: "如何申請助養？",
  questionEn: "How do I sponsor an animal?",
  answerZh: "請填寫助養表格。",
  answerEn: "Please fill out the sponsorship form.",
  keywordsZh: "助養, 貓, 狗",
  keywordsEn: "sponsor, cat, dog",
  ctaKey: "",
  sensitive: false,
  sortOrder: 0,
  isActive: true,
};

describe("toInput", () => {
  test("omits id for a new-entry draft", () => {
    expect(toInput(baseDraft).id).toBeUndefined();
  });

  test("includes id when editing an existing entry", () => {
    const input = toInput({ ...baseDraft, id: "11111111-1111-4111-8111-111111111111" });
    expect(input.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("splits, trims, and filters comma-separated keywords for zh and en", () => {
    const input = toInput({
      ...baseDraft,
      keywordsZh: "助養, 貓,, 狗 ",
      keywordsEn: " sponsor ,cat,, dog",
    });
    expect(input.keywordsZh).toEqual(["助養", "貓", "狗"]);
    expect(input.keywordsEn).toEqual(["sponsor", "cat", "dog"]);
  });

  test("returns an empty array when keywords are blank", () => {
    const input = toInput({ ...baseDraft, keywordsZh: "", keywordsEn: "   " });
    expect(input.keywordsZh).toEqual([]);
    expect(input.keywordsEn).toEqual([]);
  });

  test("coalesces an empty ctaKey to null", () => {
    expect(toInput({ ...baseDraft, ctaKey: "" }).ctaKey).toBeNull();
  });

  test("keeps a non-empty ctaKey", () => {
    expect(toInput({ ...baseDraft, ctaKey: "sponsorship-form" }).ctaKey).toBe("sponsorship-form");
  });
});
