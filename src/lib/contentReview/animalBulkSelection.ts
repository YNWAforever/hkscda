import type { AdminLanguage } from "../admin/language";

type AnimalReviewPage = { total: number; items: Array<{ entity_id: string }> };

/** Why a selection of animal drafts for source review was refused. */
export type AnimalReviewSelectionErrorCode = "out_of_range" | "list_changed" | "too_many";

/**
 * The `zh` text is the message each case has always thrown, word for word. Two of the three were
 * never translated and are English, so the Chinese admin has always seen them in English; they
 * stay as they were so the default output does not change.
 */
const ANIMAL_SELECTION_ERROR_TEXT: Record<
  AnimalReviewSelectionErrorCode,
  Record<AdminLanguage, string>
> = {
  out_of_range: {
    zh: "Animal review bulk selection must contain 1 to 1000 profiles",
    en: "A bulk review selection must hold 1 to 1,000 animal drafts. Adjust your selection and try again.",
  },
  list_changed: {
    zh: "Animal review queue changed during bulk selection",
    en: "The animal review queue changed while you were selecting. Select the drafts again.",
  },
  too_many: {
    zh: "最多只能選取 1000 筆動物草稿",
    en: "You can select at most 1,000 animal drafts. Clear some and try again.",
  },
};

/** The message for a selection error code. Defaults to zh-HK, word for word what it always was. */
export function animalReviewSelectionErrorText(
  code: AnimalReviewSelectionErrorCode,
  language: AdminLanguage = "zh",
): string {
  return ANIMAL_SELECTION_ERROR_TEXT[code][language];
}

/**
 * Thrown when a selection of animal drafts cannot be made. Its `message` is what it always was,
 * so code that shows it as it is keeps working; a screen reads `code` and writes the message for
 * the admin's language with `animalReviewSelectionErrorText`.
 */
export class AnimalReviewSelectionError extends Error {
  constructor(readonly code: AnimalReviewSelectionErrorCode) {
    super(animalReviewSelectionErrorText(code));
    this.name = "AnimalReviewSelectionError";
  }
}

export async function collectAnimalReviewIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<AnimalReviewPage>,
  limit = 25,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new AnimalReviewSelectionError("out_of_range");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.items.length === 0 ||
      result.items.length > Math.min(limit, remaining)
    ) {
      throw new AnimalReviewSelectionError("list_changed");
    }
    ids.push(...result.items.map((item) => item.entity_id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new AnimalReviewSelectionError("list_changed");
  }
  return ids;
}

export function addAnimalReviewSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new AnimalReviewSelectionError("too_many");
  return next;
}
