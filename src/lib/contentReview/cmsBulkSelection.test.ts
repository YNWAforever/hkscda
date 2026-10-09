import { expect, test } from "bun:test";
import { expectNoChineseText } from "../../components/admin/i18n/testing";
import {
  addCmsReviewSelection,
  CmsReviewSelectionError,
  cmsReviewSelectionErrorText,
  collectCmsReviewIds,
  type CmsReviewSelectionErrorCode,
} from "./cmsBulkSelection";

test("CMS content review bulk selection freezes 25 or all 1000 and rejects changes", async () => {
  const one = await collectCmsReviewIds(25, async () => ({
    total: 25,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "page-" + i })),
  }));
  expect(one).toHaveLength(25);
  const page = async (page: number) => ({
    total: 1000,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((page - 1) * 25 + i) })),
  });
  expect(await collectCmsReviewIds(1000, page)).toHaveLength(1000);
  await expect(collectCmsReviewIds(1001, page)).rejects.toThrow();
  await expect(
    collectCmsReviewIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((index - 1) * 25 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st CMS content", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addCmsReviewSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addCmsReviewSelection(current, ["id-1000"])).toThrow();
});

// The messages each case has always thrown. Two are English: they were never translated, so the
// Chinese admin has always seen them in English, and they stay as they were.
const MESSAGES: Record<CmsReviewSelectionErrorCode, string> = {
  out_of_range: "CMS review bulk selection must contain 1 to 1000 profiles",
  list_changed: "CMS review queue changed during bulk selection",
  too_many: "最多只能選取 1000 筆CMS 草稿",
};

test("a refused selection carries a code, and its message is the text it always was", async () => {
  const outOfRange = await collectCmsReviewIds(1001, async () => ({
    total: 1001,
    items: [{ entity_id: "a" }],
  })).catch((error: unknown) => error);
  expect(outOfRange).toBeInstanceOf(CmsReviewSelectionError);
  expect(outOfRange).toMatchObject({ code: "out_of_range", message: MESSAGES.out_of_range });

  const changed = await collectCmsReviewIds(2, async () => ({
    total: 3,
    items: [{ entity_id: "a" }],
  })).catch((error: unknown) => error);
  expect(changed).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const duplicated = await collectCmsReviewIds(2, async () => ({
    total: 2,
    items: [{ entity_id: "a" }, { entity_id: "a" }],
  })).catch((error: unknown) => error);
  expect(duplicated).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const full = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(() => addCmsReviewSelection(full, ["id-1000"])).toThrow(MESSAGES.too_many);
  let thrown: unknown;
  try {
    addCmsReviewSelection(full, ["id-1000"]);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code: "too_many" });
});

test("cmsReviewSelectionErrorText defaults to the old text and has an English message for each code", () => {
  for (const code of Object.keys(MESSAGES) as CmsReviewSelectionErrorCode[]) {
    expect(cmsReviewSelectionErrorText(code)).toBe(MESSAGES[code]);
    expect(cmsReviewSelectionErrorText(code, "zh")).toBe(MESSAGES[code]);
    const english = cmsReviewSelectionErrorText(code, "en");
    expectNoChineseText(english);
    // Every English error says what to do next.
    expect(english, code).toMatch(/(Adjust your selection|Select the drafts|Clear some)/);
  }
  expect(cmsReviewSelectionErrorText("too_many", "en")).toBe(
    "You can select at most 1,000 CMS drafts. Clear some and try again.",
  );
});
