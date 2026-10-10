import type { AdminLanguage } from "../admin/language";

type PledgePage = { total: number; pledges: Array<{ id: string }> };

/** Why a selection of pledges was refused. */
export type PledgeSelectionErrorCode = "out_of_range" | "list_changed" | "too_many";

const SELECTION_ERROR_TEXT: Record<PledgeSelectionErrorCode, Record<AdminLanguage, string>> = {
  out_of_range: {
    zh: "助養批量選取須為 1 至 1000 筆",
    en: "A bulk selection must hold 1 to 1,000 pledges. Narrow the filters and try again.",
  },
  list_changed: {
    zh: "助養列表在選取期間變更",
    en: "The pledge list changed while you were selecting. Select the pledges again.",
  },
  too_many: {
    zh: "最多只能選取 1000 筆助養承諾",
    en: "You can select at most 1,000 pledges. Clear some and try again.",
  },
};

/** The message for a selection error code. Defaults to zh-HK, word for word what it always was. */
export function pledgeSelectionErrorText(
  code: PledgeSelectionErrorCode,
  language: AdminLanguage = "zh",
): string {
  return SELECTION_ERROR_TEXT[code][language];
}

/**
 * Thrown when a pledge selection cannot be made. Its `message` stays zh-HK, so code that shows
 * it as it is keeps working; a screen reads `code` and writes the message for the admin's
 * language with `pledgeSelectionErrorText`.
 */
export class PledgeSelectionError extends Error {
  constructor(readonly code: PledgeSelectionErrorCode) {
    super(pledgeSelectionErrorText(code));
    this.name = "PledgeSelectionError";
  }
}

export async function collectMatchingPledgeIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<PledgePage>,
  limit = 50,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new PledgeSelectionError("out_of_range");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.pledges.length === 0 ||
      result.pledges.length > Math.min(limit, remaining)
    ) {
      throw new PledgeSelectionError("list_changed");
    }
    ids.push(...result.pledges.map((item) => item.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new PledgeSelectionError("list_changed");
  }
  return ids;
}

export function addPledgeSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new PledgeSelectionError("too_many");
  return next;
}
