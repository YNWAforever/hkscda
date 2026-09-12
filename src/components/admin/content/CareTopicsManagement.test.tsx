import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const realReactQuery = await import("@tanstack/react-query");

let topicsError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: () => ({
    data: topicsError ? undefined : { items: [] },
    error: topicsError,
    isLoading: false,
    isError: topicsError !== null,
    refetch: () => {},
  }),
}));

const { CareTopicsManagement, toCareTopicInput } = await import("./CareTopicsManagement");

describe("CareTopicsManagement", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    topicsError = new Error("boom");
    const markup = renderToStaticMarkup(
      <CareTopicsManagement activeTab="careTopics" onTabChange={() => {}} />,
    );
    expect(markup).toContain("無法載入照顧須知");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    topicsError = null;
  });

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
