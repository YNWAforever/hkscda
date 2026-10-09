import { describe, expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

const realReactQuery = await import("@tanstack/react-query");

let rulesError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: () => ({
    data: rulesError ? undefined : { items: [] },
    error: rulesError,
    isLoading: false,
    isError: rulesError !== null,
    refetch: () => {},
  }),
}));

const { AdoptionRulesManagement, toRuleInput } = await import("./AdoptionRulesManagement");

describe("AdoptionRulesManagement", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    rulesError = new Error("boom");
    const markup = renderAdminInChinese(
      <AdoptionRulesManagement activeTab="rules" onTabChange={() => {}} />,
    );
    expect(markup).toContain("無法載入領養規則");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    rulesError = null;
  });

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
