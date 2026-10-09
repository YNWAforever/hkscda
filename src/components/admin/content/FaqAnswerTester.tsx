import { useId, useMemo } from "react";

import type { FaqLanguage, HelpFaq } from "../../../lib/faq/types";
import { describeHelpOutcome } from "../../../lib/help/outcome";
import {
  requiresStaffContact,
  searchHelpFaqs,
  type HelpSearchConfidence,
} from "../../../lib/help/search";

// The full-page help search's result limit; the compact widget uses 3.
const TESTER_RESULT_LIMIT = 8;

const CONFIDENCE_LABELS: Record<HelpSearchConfidence, string> = {
  high: "高",
  medium: "中",
  low: "低",
  none: "沒有",
};

const LANGUAGE_OPTIONS: Array<{ value: FaqLanguage; label: string }> = [
  { value: "zh-HK", label: "中文" },
  { value: "en", label: "English" },
];

export type FaqAnswerTesterProps = {
  /** The FAQs to search: the active entries, with any open draft applied. */
  faqs: HelpFaq[];
  /** True when the open draft is set to hidden, so visitors will not see it. */
  draftHidden: boolean;
  query: string;
  language: FaqLanguage;
  onQueryChange(query: string): void;
  onLanguageChange(language: FaqLanguage): void;
};

/**
 * Lets staff type a visitor's phrasing and see what the public FAQ search would
 * show. It runs the same search and outcome rule as `HelpSearch`.
 */
export function FaqAnswerTester({
  faqs,
  draftHidden,
  query,
  language,
  onQueryChange,
  onLanguageChange,
}: FaqAnswerTesterProps) {
  const id = useId();
  const hasQuery = query.trim().length > 0;

  const response = useMemo(
    () => searchHelpFaqs(query, faqs, { language, limit: TESTER_RESULT_LIMIT }),
    [faqs, language, query],
  );
  const outcome = describeHelpOutcome(response, query);

  const outcomeLabels = [
    outcome.direct ? "直接答案" : outcome.related.length > 0 ? "相關答案" : null,
    outcome.showFallback ? "轉介職員" : null,
  ].filter((label): label is string => label !== null);
  // The visitor sees the direct answer alone, or else the related list.
  const shownResults = outcome.direct ? [outcome.direct] : outcome.related;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="space-y-1">
        <h2 id={`${id}-heading`} className="text-base font-bold text-[var(--color-text)]">
          測試答案
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          輸入訪客的問法，查看公開搜尋會顯示甚麼。結果包括正在編輯、尚未儲存的草稿。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor={`${id}-query`} className="block text-sm font-medium">
            訪客的問法
          </label>
          <input
            id={`${id}-query`}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
        </div>
        <fieldset className="flex items-center gap-4">
          <legend className="sr-only">語言</legend>
          {LANGUAGE_OPTIONS.map((option) => (
            <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-language`}
                value={option.value}
                checked={language === option.value}
                onChange={() => onLanguageChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>

      {draftHidden ? (
        <p className="rounded-md bg-[var(--color-warning-highlight)] px-3 py-2 text-sm text-[var(--color-warning)]">
          此草稿目前設為不顯示，訪客在啟用前不會看到。
        </p>
      ) : null}

      <div aria-live="polite">
        {hasQuery ? (
          <div className="space-y-2 rounded-md bg-[var(--color-surface-offset)] p-3 text-sm text-[var(--color-text)]">
            <p>
              配對程度：<strong>{CONFIDENCE_LABELS[response.confidence]}</strong>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span>訪客會看到：</span>
              {outcomeLabels.map((label) => (
                <strong
                  key={label}
                  className="rounded-full bg-[var(--color-info-highlight)] px-2 py-0.5 text-xs text-[var(--color-info)]"
                >
                  {label}
                </strong>
              ))}
            </p>
            {shownResults.length > 0 ? (
              <div>
                <p>配對的問題：</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {shownResults.map((result) => (
                    <li key={result.faq.id}>{result.faq.question[language]}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {requiresStaffContact(query) ? <p>此問題會建議訪客聯絡職員</p> : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        已發佈的修改最多需要 5 分鐘才會在訪客的頁面上出現。
      </p>
    </section>
  );
}
