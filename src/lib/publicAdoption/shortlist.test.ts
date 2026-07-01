import { describe, expect, test } from "bun:test";

import { addShortlistItem, removeShortlistItem, reorderAdoptionItems } from "./shortlist";
import type { ShortlistItem } from "./shortlist";

const baseAnimal = {
  id: "77777777-8888-4333-8444-555555555555",
  name: "Mochi",
  animalType: "cat" as const,
  imageUrl: null,
};

function item(id: string, rank: number): ShortlistItem {
  return {
    id,
    name: `Animal ${rank}`,
    animalType: "cat",
    imageUrl: null,
    intent: "adoption",
    rank,
  };
}

describe("shortlist reducer helpers", () => {
  test("adds adoption animals with the next rank", () => {
    const result = addShortlistItem([], { ...baseAnimal, intent: "adoption" });
    expect(result.items).toEqual([{ ...baseAnimal, intent: "adoption", rank: 1 }]);
    expect(result.message).toBeNull();
  });

  test("enforces adoption limit of three", () => {
    const result = addShortlistItem([item("a", 1), item("b", 2), item("c", 3)], {
      ...baseAnimal,
      id: "d",
      intent: "adoption",
    });
    expect(result.items).toHaveLength(3);
    expect(result.message).toBe("最多可選擇 3 隻領養動物。");
  });

  test("does not allow the same animal under two intents", () => {
    const result = addShortlistItem([{ ...baseAnimal, intent: "adoption", rank: 1 }], {
      ...baseAnimal,
      intent: "sponsorship",
    });
    expect(result.items).toHaveLength(1);
    expect(result.message).toBe("此動物已在清單內，請先移除再轉換意向。");
  });

  test("removes an item and compacts adoption ranks", () => {
    expect(removeShortlistItem([item("a", 1), item("b", 2), item("c", 3)], "b")).toEqual([
      item("a", 1),
      { ...item("c", 3), rank: 2 },
    ]);
  });

  test("reorders adoption ranks", () => {
    expect(
      reorderAdoptionItems([item("a", 1), item("b", 2), item("c", 3)], ["c", "a", "b"]),
    ).toEqual([
      { ...item("c", 3), rank: 1 },
      { ...item("a", 1), rank: 2 },
      { ...item("b", 2), rank: 3 },
    ]);
  });
});
