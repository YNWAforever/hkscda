import type { AdminLanguage } from "../../../lib/admin/language";

const LANGUAGE_TAGS: Record<AdminLanguage, string> = { zh: "zh-HK", en: "en" };

/** The `lang` attribute value for a language: `zh-HK` or `en`. */
export function adminLanguageTag(language: AdminLanguage): string {
  return LANGUAGE_TAGS[language];
}

/**
 * Sets the page language on `root` (the `<html>` element) and returns a function that puts
 * the previous value back. Dialogs and the mobile menu render in a portal outside the
 * admin root element, so a `lang` attribute on that element does not reach them; the
 * attribute on `<html>` does.
 */
export function setAdminDocumentLanguage(
  root: { lang: string },
  language: AdminLanguage,
): () => void {
  const previous = root.lang;
  root.lang = adminLanguageTag(language);
  return () => {
    root.lang = previous;
  };
}
