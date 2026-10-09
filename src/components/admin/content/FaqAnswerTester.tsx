import { useId, useMemo } from "react";

import type { FaqLanguage, HelpFaq } from "../../../lib/faq/types";
import { describeHelpOutcome } from "../../../lib/help/outcome";
import { requiresStaffContact, searchHelpFaqs } from "../../../lib/help/search";
import { useAdminCopy } from "../i18n/copy";
import { faqCopy } from "./faqCopy";

// The full-page help search's result limit; the compact widget uses 3.
const TESTER_RESULT_LIMIT = 8;

const LANGUAGE_OPTIONS: readonly FaqLanguage[] = ["zh-HK", "en"];

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
  const common = useAdminCopy(faqCopy);
  const copy = common.tester;
  const id = useId();
  const hasQuery = query.trim().length > 0;

  const response = useMemo(
    () => searchHelpFaqs(query, faqs, { language, limit: TESTER_RESULT_LIMIT }),
    [faqs, language, query],
  );
  const outcome = describeHelpOutcome(response, query);

  const answerLabel = outcome.direct ? copy.direct : copy.related;
  const outcomeLabels = [
    outcome.direct || outcome.related.length > 0 ? answerLabel : null,
    outcome.showFallback ? copy.referToStaff : null,
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
          {copy.heading}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor={`${id}-query`} className="block text-sm font-medium">
            {copy.queryLabel}
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
          <legend className="sr-only">{copy.languageLegend}</legend>
          {LANGUAGE_OPTIONS.map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-language`}
                value={option}
                checked={language === option}
                onChange={() => onLanguageChange(option)}
              />
              {common.languages[option]}
            </label>
          ))}
        </fieldset>
      </div>

      {draftHidden ? (
        <p className="rounded-md bg-[var(--color-warning-highlight)] px-3 py-2 text-sm text-[var(--color-warning)]">
          {copy.draftHidden}
        </p>
      ) : null}

      <div aria-live="polite">
        {hasQuery ? (
          <div className="space-y-2 rounded-md bg-[var(--color-surface-offset)] p-3 text-sm text-[var(--color-text)]">
            <p>
              {copy.matchLevel}
              <strong>{copy.confidence[response.confidence]}</strong>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span>{copy.willSee}</span>
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
                <p>{copy.matchedQuestions}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {shownResults.map((result) => (
                    <li key={result.faq.id}>{result.faq.question[language]}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {requiresStaffContact(query) ? <p>{copy.advisedToContact}</p> : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">{copy.cacheNote}</p>
    </section>
  );
}
