import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminLanguage } from "../../../lib/admin/language";
import { AdminLanguageProvider } from "../adminI18n";

/**
 * Helpers for the English-parity tests every admin area adds: render a screen inside
 * `AdminLanguageProvider` in one language, then check what is left of the other.
 */

function renderIn(language: AdminLanguage, element: ReactElement): string {
  return renderToStaticMarkup(
    <AdminLanguageProvider initialLanguage={language}>{element}</AdminLanguageProvider>,
  );
}

export function renderAdminInEnglish(element: ReactElement): string {
  return renderIn("en", element);
}

export function renderAdminInChinese(element: ReactElement): string {
  return renderIn("zh", element);
}

/**
 * Han characters, plus the CJK punctuation block and the full-width forms block, so that
 * a stray ideographic full stop, colon or bracket in an English screen is found too.
 */
const CHINESE_RUN = /[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]+/gu;

/** Every unbroken run of Chinese text in `text`, in order. */
export function findChineseRuns(text: string): string[] {
  return text.match(CHINESE_RUN) ?? [];
}

/**
 * Throws when `markup` still contains Chinese. `allow` lists text that is allowed to be
 * there, such as fixture data a staff member typed: it is removed before the check, so
 * it covers exactly that text and nothing around it.
 */
export function expectNoChineseText(markup: string, options: { allow?: string[] } = {}): void {
  let remaining = markup;
  // Longest first, so an allowed phrase is not half-removed by a shorter one inside it.
  for (const allowed of [...(options.allow ?? [])].sort((a, b) => b.length - a.length)) {
    if (allowed) remaining = remaining.split(allowed).join(" ");
  }
  const runs = findChineseRuns(remaining);
  if (runs.length === 0) return;
  throw new Error(
    `Expected no Chinese text, found ${runs.length} run${runs.length === 1 ? "" : "s"}: ${runs
      .map((run) => `"${run}"`)
      .join(", ")}`,
  );
}
