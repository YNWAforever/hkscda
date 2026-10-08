import type { AdminLanguage } from "../admin/language";

type CasePage = { total: number; cases: Array<{ id: string }> };

/**
 * The messages this module throws, keyed by what went wrong. The Chinese column is what the
 * admin has always shown, word for word. Two of those messages were English-only before the
 * English admin existed, so their Chinese column is still that English text until the owner
 * approves Chinese wording for them.
 */
const SELECTION_MESSAGES = {
  sizeOutOfRange: {
    zh: "Adoption bulk selection must contain 1 to 1000 profiles",
    en: "Select between 1 and 1,000 adoption cases.",
  },
  listChanged: {
    zh: "Adoption case list changed during bulk selection",
    en: "The case list changed while the cases were being selected. Select them again.",
  },
  tooManySelected: {
    zh: "最多只能選取 1000 筆領養個案",
    en: "You can select at most 1,000 adoption cases. Clear some and try again.",
  },
} as const satisfies Record<string, Record<AdminLanguage, string>>;

export async function collectMatchingCaseIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<CasePage>,
  limit = 50,
  language: AdminLanguage = "zh",
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error(SELECTION_MESSAGES.sizeOutOfRange[language]);
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.cases.length === 0 ||
      result.cases.length > Math.min(limit, remaining)
    ) {
      throw new Error(SELECTION_MESSAGES.listChanged[language]);
    }
    ids.push(...result.cases.map((item) => item.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error(SELECTION_MESSAGES.listChanged[language]);
  }
  return ids;
}

export function addCaseSelection(
  current: string[],
  additions: string[],
  language: AdminLanguage = "zh",
): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new Error(SELECTION_MESSAGES.tooManySelected[language]);
  return next;
}
