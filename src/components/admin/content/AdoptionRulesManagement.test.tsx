import { describe, expect, test } from "bun:test";

import { toRuleInput } from "./AdoptionRulesManagement";

describe("AdoptionRulesManagement", () => {
  describe("toRuleInput", () => {
    test("maps a new draft without an id", () => {
      const input = toRuleInput({
        contentZh: "規則",
        contentEn: "Rule",
        sortOrder: 3,
        isPublished: true,
      });
      expect(input).toEqual({
        content: { "zh-HK": "規則", en: "Rule" },
        sortOrder: 3,
        isPublished: true,
      });
      expect("id" in input).toBe(false);
    });

    test("preserves an existing id when editing", () => {
      const input = toRuleInput({
        id: "11111111-2222-4333-8444-555555555555",
        contentZh: "規則",
        contentEn: "Rule",
        sortOrder: 0,
        isPublished: false,
      });
      expect(input.id).toBe("11111111-2222-4333-8444-555555555555");
      expect(input.isPublished).toBe(false);
    });
  });
});
