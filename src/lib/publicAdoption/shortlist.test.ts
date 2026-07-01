import { describe, expect, test } from "bun:test";

import {
  addShortlistItem,
  intentForAnimalType,
  parseShortlist,
  removeIntentItems,
  removeShortlistItem,
  reorderAdoptionItems,
} from "./shortlist";
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

function sponsor(id: string, rank: number): ShortlistItem {
  return {
    id,
    name: `Sponsor ${rank}`,
    animalType: "sponsor",
    imageUrl: null,
    intent: "sponsorship",
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

  test("parses corrupted storage by deduping animal ids and compacting ranks", () => {
    const result = parseShortlist(
      JSON.stringify([
        item("a", 4),
        { ...item("a", 1), name: "Duplicate adoption" },
        { ...baseAnimal, id: "a", intent: "sponsorship", rank: 1 },
        item("b", 8),
      ]),
    );

    expect(result).toEqual([
      { ...item("a", 4), rank: 1 },
      { ...item("b", 8), rank: 2 },
    ]);
  });

  test("parses corrupted storage by capping adoption and sponsorship limits", () => {
    const adoptionItems = Array.from({ length: 5 }, (_, index) =>
      item(`adoption-${index}`, index + 1),
    );
    const sponsorshipItems = Array.from(
      { length: 12 },
      (_, index): ShortlistItem => ({
        id: `sponsorship-${index}`,
        name: `Sponsor ${index}`,
        animalType: "sponsor",
        imageUrl: null,
        intent: "sponsorship",
        rank: index + 1,
      }),
    );

    const result = parseShortlist(JSON.stringify([...adoptionItems, ...sponsorshipItems]));

    expect(result).toHaveLength(13);
    expect(result.filter((parsedItem) => parsedItem.intent === "adoption")).toEqual([
      item("adoption-0", 1),
      item("adoption-1", 2),
      item("adoption-2", 3),
    ]);
    expect(result.filter((parsedItem) => parsedItem.intent === "sponsorship")).toHaveLength(10);
    expect(result.at(-1)).toMatchObject({ id: "sponsorship-9", rank: 10 });
  });
});

describe("intentForAnimalType", () => {
  test("maps sponsor to sponsorship", () => {
    expect(intentForAnimalType("sponsor")).toBe("sponsorship");
  });

  test("maps cat and dog to adoption", () => {
    expect(intentForAnimalType("cat")).toBe("adoption");
    expect(intentForAnimalType("dog")).toBe("adoption");
  });
});

describe("removeIntentItems", () => {
  test("removes only the target intent, keeping the other intent", () => {
    const items = [item("a", 1), item("b", 2), sponsor("s1", 1), sponsor("s2", 2)];
    expect(removeIntentItems(items, "adoption")).toEqual([sponsor("s1", 1), sponsor("s2", 2)]);
  });

  test("recompacts remaining adoption ranks after removing sponsorship", () => {
    const items = [item("a", 2), item("b", 3), sponsor("s1", 1)];
    expect(removeIntentItems(items, "sponsorship")).toEqual([
      { ...item("a", 2), rank: 1 },
      { ...item("b", 3), rank: 2 },
    ]);
  });

  test("is a no-op when the intent is absent", () => {
    const items = [item("a", 1), item("b", 2)];
    expect(removeIntentItems(items, "sponsorship")).toEqual([item("a", 1), item("b", 2)]);
  });
});
