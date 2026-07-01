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

function isShortlistItem(item: unknown): item is ShortlistItem {
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof (item as ShortlistItem).id === "string" &&
    typeof (item as ShortlistItem).name === "string" &&
    ["cat", "dog", "sponsor"].includes((item as ShortlistItem).animalType) &&
    ["adoption", "sponsorship"].includes((item as ShortlistItem).intent) &&
    typeof (item as ShortlistItem).rank === "number"
  );
}

function sanitizeRestoredItems(items: ShortlistItem[]) {
  const seenAnimalIds = new Set<string>();
  const restoredItems: ShortlistItem[] = [];
  let adoptionCount = 0;
  let sponsorshipCount = 0;

  for (const item of items) {
    if (seenAnimalIds.has(item.id)) continue;

    if (item.intent === "adoption") {
      if (adoptionCount >= ADOPTION_LIMIT) continue;
      adoptionCount += 1;
    } else {
      if (sponsorshipCount >= SPONSORSHIP_LIMIT) continue;
      sponsorshipCount += 1;
    }

    seenAnimalIds.add(item.id);
    restoredItems.push(item);
  }

  return compactRanks(restoredItems);
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

export function intentForAnimalType(animalType: ShortlistAnimalType): ShortlistIntent {
  return animalType === "sponsor" ? "sponsorship" : "adoption";
}

export function removeIntentItems(
  items: ShortlistItem[],
  intent: ShortlistIntent,
): ShortlistItem[] {
  return compactRanks(items.filter((item) => item.intent !== intent));
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
    return sanitizeRestoredItems(parsed.filter(isShortlistItem));
  } catch {
    return [];
  }
}
