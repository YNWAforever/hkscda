import { describe, expect, test } from "bun:test";

import { toCareTopicInput } from "./CareTopicsManagement";

describe("CareTopicsManagement", () => {
  describe("toCareTopicInput", () => {
    test("maps a new draft without an id", () => {
      const input = toCareTopicInput({
        animalType: "cat",
        labelZh: "家居",
        labelEn: "Home",
        contentZh: "內容",
        contentEn: "Content",
        sortOrder: 2,
        isPublished: true,
      });
      expect(input).toEqual({
        animalType: "cat",
        label: { "zh-HK": "家居", en: "Home" },
        content: { "zh-HK": "內容", en: "Content" },
        sortOrder: 2,
        isPublished: true,
      });
      expect("id" in input).toBe(false);
    });

    test("preserves an existing id and species when editing", () => {
      const input = toCareTopicInput({
        id: "11111111-2222-4333-8444-555555555555",
        animalType: "dog",
        labelZh: "溜狗",
        labelEn: "Walk",
        contentZh: "內容",
        contentEn: "Content",
        sortOrder: 6,
        isPublished: false,
      });
      expect(input.id).toBe("11111111-2222-4333-8444-555555555555");
      expect(input.animalType).toBe("dog");
      expect(input.isPublished).toBe(false);
    });
  });
});
