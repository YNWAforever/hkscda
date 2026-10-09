import type { AdminLanguage } from "../../admin/language";

type VolunteerPage = { total: number; profiles: Array<{ id: string }> };

/** Why a selection of volunteer profiles was refused. */
export type VolunteerSelectionErrorCode =
  | "out_of_range"
  | "list_changed"
  | "too_many"
  | "filter_changed";

/**
 * The text of each code. The zh-HK column is word for word what the admin has always shown, which
 * for `out_of_range` and `list_changed` is English: the Chinese admin never had a Chinese text for
 * those two. The English column is for the English admin and says what to do next.
 */
const SELECTION_ERROR_TEXT: Record<VolunteerSelectionErrorCode, Record<AdminLanguage, string>> = {
  out_of_range: {
    zh: "Volunteer bulk selection must contain 1 to 1000 profiles",
    en: "A bulk selection must hold 1 to 1,000 volunteer profiles. Narrow the filters and try again.",
  },
  list_changed: {
    zh: "Volunteer directory changed during bulk selection",
    en: "The volunteer directory changed while you were selecting. Select the profiles again.",
  },
  too_many: {
    zh: "最多只能選取 1000 筆義工身份",
    en: "You can select at most 1,000 volunteer profiles. Clear some and try again.",
  },
  filter_changed: {
    zh: "篩選條件已變更；請重新選取",
    en: "The filters changed. Select the profiles again.",
  },
};

/** The message for a selection error code. Defaults to zh-HK, word for word what it always was. */
export function volunteerSelectionErrorText(
  code: VolunteerSelectionErrorCode,
  language: AdminLanguage = "zh",
): string {
  return SELECTION_ERROR_TEXT[code][language];
}

/**
 * Thrown when a selection of volunteer profiles cannot be made. Its `message` stays the zh-HK text,
 * so code that shows it as it is keeps working; a screen reads `code` and writes the message for the
 * admin's language with `volunteerSelectionErrorText`.
 */
export class VolunteerSelectionError extends Error {
  constructor(readonly code: VolunteerSelectionErrorCode) {
    super(volunteerSelectionErrorText(code));
    this.name = "VolunteerSelectionError";
  }
}

export async function collectMatchingVolunteerIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<VolunteerPage>,
  limit = 50,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new VolunteerSelectionError("out_of_range");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.profiles.length === 0 ||
      result.profiles.length > Math.min(limit, remaining)
    ) {
      throw new VolunteerSelectionError("list_changed");
    }
    ids.push(...result.profiles.map((profile) => profile.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new VolunteerSelectionError("list_changed");
  }
  return ids;
}

export function addVolunteerSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new VolunteerSelectionError("too_many");
  return next;
}
