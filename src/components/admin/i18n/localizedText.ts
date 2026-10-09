import type { AdminLanguage } from "../../../lib/admin/language";

/**
 * Picks the value a record holds in the active language, for data that has a Chinese and
 * an English column (`name` and `name_en`). English shows the English column; when it is
 * empty, blank or null the Chinese value stands in for it, so a record is never shown
 * blank in English. Chinese always shows its own value, exactly as it did before there was
 * an English admin. Nothing is translated: both values are the ones staff entered, shown
 * as they were typed.
 */
export function localizedText(
  zh: string | null | undefined,
  en: string | null | undefined,
  language: AdminLanguage,
): string {
  if (language === "en" && en && en.trim()) return en;
  return zh ?? "";
}

/**
 * The English column listed beside the Chinese value, which is how the Chinese admin has
 * always shown a name. English shows the English column as the main value (see
 * `localizedText`), so it lists nothing beside it.
 */
export function englishAlongside(
  en: string | null | undefined,
  language: AdminLanguage,
): string | null {
  return language === "zh" && en ? en : null;
}
