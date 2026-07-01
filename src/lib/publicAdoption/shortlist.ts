export type ShortlistIntent = "adoption" | "sponsorship";
export type ShortlistAnimalType = "cat" | "dog" | "sponsor";

export type ShortlistItem = {
  id: string;
  name: string;
  animalType: ShortlistAnimalType;
  imageUrl: string | null;
  intent: ShortlistIntent;
  rank: number;
};

export type AddShortlistInput = Omit<ShortlistItem, "rank">;
export type ShortlistResult = { items: ShortlistItem[]; message: string | null };

export const ADOPTION_LIMIT = 3;
export const SPONSORSHIP_LIMIT = 10;
export const SHORTLIST_STORAGE_KEY = "hkscda-public-shortlist-v1";

function compactRanks(items: ShortlistItem[]) {
  const adoptionItems = items
    .filter((item) => item.intent === "adoption")
    .sort((left, right) => left.rank - right.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const sponsorshipItems = items
    .filter((item) => item.intent === "sponsorship")
    .sort((left, right) => left.rank - right.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return [...adoptionItems, ...sponsorshipItems];
}

export function addShortlistItem(
  items: ShortlistItem[],
  input: AddShortlistInput,
): ShortlistResult {
  const existing = items.find((item) => item.id === input.id);
  if (existing) {
    return {
      items,
      message:
        existing.intent === input.intent
          ? "此動物已在清單內。"
          : "此動物已在清單內，請先移除再轉換意向。",
    };
  }

  const currentIntentCount = items.filter((item) => item.intent === input.intent).length;
  const limit = input.intent === "adoption" ? ADOPTION_LIMIT : SPONSORSHIP_LIMIT;
  if (currentIntentCount >= limit) {
    return {
      items,
      message:
        input.intent === "adoption" ? "最多可選擇 3 隻領養動物。" : "最多可選擇 10 隻助養動物。",
    };
  }

  return {
    items: compactRanks([...items, { ...input, rank: currentIntentCount + 1 }]),
    message: null,
  };
}

export function removeShortlistItem(items: ShortlistItem[], animalId: string) {
  return compactRanks(items.filter((item) => item.id !== animalId));
}

export function reorderAdoptionItems(items: ShortlistItem[], orderedIds: string[]) {
  const adoptionById = new Map(
    items.filter((item) => item.intent === "adoption").map((item) => [item.id, item]),
  );
  const orderedAdoption = orderedIds
    .map((id) => adoptionById.get(id))
    .filter((item): item is ShortlistItem => Boolean(item))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const untouchedAdoption = [...adoptionById.values()].filter(
    (item) => !orderedIds.includes(item.id),
  );
  const sponsorship = items.filter((item) => item.intent === "sponsorship");
  return compactRanks([...orderedAdoption, ...untouchedAdoption, ...sponsorship]);
}

export function serializeShortlist(items: ShortlistItem[]) {
  return JSON.stringify(compactRanks(items));
}

export function parseShortlist(value: string | null): ShortlistItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return compactRanks(
      parsed.filter(
        (item): item is ShortlistItem =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          ["cat", "dog", "sponsor"].includes(item.animalType) &&
          ["adoption", "sponsorship"].includes(item.intent) &&
          typeof item.rank === "number",
      ),
    );
  } catch {
    return [];
  }
}
