import type { AdminLanguage } from "../admin/language";

type CmsReviewPage = { total: number; items: Array<{ entity_id: string }> };

/** Why a selection of CMS drafts for source review was refused. */
export type CmsReviewSelectionErrorCode = "out_of_range" | "list_changed" | "too_many";

/**
 * The `zh` text is the message each case has always thrown, word for word. Two of the three were
 * never translated and are English, so the Chinese admin has always seen them in English; they
 * stay as they were so the default output does not change.
 */
const CMS_SELECTION_ERROR_TEXT: Record<
  CmsReviewSelectionErrorCode,
  Record<AdminLanguage, string>
> = {
  out_of_range: {
    zh: "CMS review bulk selection must contain 1 to 1000 profiles",
    en: "A bulk review selection must hold 1 to 1,000 CMS drafts. Adjust your selection and try again.",
  },
  list_changed: {
    zh: "CMS review queue changed during bulk selection",
    en: "The CMS review queue changed while you were selecting. Select the drafts again.",
  },
  too_many: {
    zh: "最多只能選取 1000 筆CMS 草稿",
    en: "You can select at most 1,000 CMS drafts. Clear some and try again.",
  },
};

/** The message for a selection error code. Defaults to zh-HK, word for word what it always was. */
export function cmsReviewSelectionErrorText(
  code: CmsReviewSelectionErrorCode,
  language: AdminLanguage = "zh",
): string {
  return CMS_SELECTION_ERROR_TEXT[code][language];
}

/**
 * Thrown when a selection of CMS drafts cannot be made. Its `message` is what it always was, so
 * code that shows it as it is keeps working; a screen reads `code` and writes the message for the
 * admin's language with `cmsReviewSelectionErrorText`.
 */
export class CmsReviewSelectionError extends Error {
  constructor(readonly code: CmsReviewSelectionErrorCode) {
    super(cmsReviewSelectionErrorText(code));
    this.name = "CmsReviewSelectionError";
  }
}

export async function collectCmsReviewIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<CmsReviewPage>,
  limit = 25,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new CmsReviewSelectionError("out_of_range");
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
      throw new CmsReviewSelectionError("list_changed");
    }
    ids.push(...result.items.map((item) => item.entity_id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new CmsReviewSelectionError("list_changed");
  }
  return ids;
}

export function addCmsReviewSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new CmsReviewSelectionError("too_many");
  return next;
}
