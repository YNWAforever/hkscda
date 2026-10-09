import { expect, test } from "bun:test";
import { expectNoChineseText } from "../../components/admin/i18n/testing";
import {
  addAnimalReviewSelection,
  AnimalReviewSelectionError,
  animalReviewSelectionErrorText,
  collectAnimalReviewIds,
  type AnimalReviewSelectionErrorCode,
} from "./animalBulkSelection";

test("animal review bulk selection freezes 25 or all 1000 and rejects changes", async () => {
  const one = await collectAnimalReviewIds(25, async () => ({
    total: 25,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "page-" + i })),
  }));
  expect(one).toHaveLength(25);
  const page = async (page: number) => ({
    total: 1000,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((page - 1) * 25 + i) })),
  });
  expect(await collectAnimalReviewIds(1000, page)).toHaveLength(1000);
  await expect(collectAnimalReviewIds(1001, page)).rejects.toThrow();
  await expect(
    collectAnimalReviewIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((index - 1) * 25 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st animal", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addAnimalReviewSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addAnimalReviewSelection(current, ["id-1000"])).toThrow();
});

// The messages each case has always thrown. Two are English: they were never translated, so the
// Chinese admin has always seen them in English, and they stay as they were.
const MESSAGES: Record<AnimalReviewSelectionErrorCode, string> = {
  out_of_range: "Animal review bulk selection must contain 1 to 1000 profiles",
  list_changed: "Animal review queue changed during bulk selection",
  too_many: "最多只能選取 1000 筆動物草稿",
};

test("a refused selection carries a code, and its message is the text it always was", async () => {
  const outOfRange = await collectAnimalReviewIds(0, async () => ({
    total: 0,
    items: [],
  })).catch((error: unknown) => error);
  expect(outOfRange).toBeInstanceOf(AnimalReviewSelectionError);
  expect(outOfRange).toMatchObject({ code: "out_of_range", message: MESSAGES.out_of_range });

  const changed = await collectAnimalReviewIds(2, async () => ({
    total: 3,
    items: [{ entity_id: "a" }],
  })).catch((error: unknown) => error);
  expect(changed).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const duplicated = await collectAnimalReviewIds(2, async () => ({
    total: 2,
    items: [{ entity_id: "a" }, { entity_id: "a" }],
  })).catch((error: unknown) => error);
  expect(duplicated).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const full = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(() => addAnimalReviewSelection(full, ["id-1000"])).toThrow(MESSAGES.too_many);
  let thrown: unknown;
  try {
    addAnimalReviewSelection(full, ["id-1000"]);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code: "too_many" });
});

test("animalReviewSelectionErrorText defaults to the old text and has an English message for each code", () => {
  for (const code of Object.keys(MESSAGES) as AnimalReviewSelectionErrorCode[]) {
    expect(animalReviewSelectionErrorText(code)).toBe(MESSAGES[code]);
    expect(animalReviewSelectionErrorText(code, "zh")).toBe(MESSAGES[code]);
    const english = animalReviewSelectionErrorText(code, "en");
    expectNoChineseText(english);
    // Every English error says what to do next.
    expect(english, code).toMatch(/(Adjust your selection|Select the drafts|Clear some)/);
  }
  expect(animalReviewSelectionErrorText("too_many", "en")).toBe(
    "You can select at most 1,000 animal drafts. Clear some and try again.",
  );
});
