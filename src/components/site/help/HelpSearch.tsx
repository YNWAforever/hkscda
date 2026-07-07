import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { trackHelpEvent } from "../../../lib/help/analytics";
import {
  helpCategoryLabels,
  helpFaqs,
  type HelpCategory,
  type HelpLanguage,
} from "../../../lib/help/faq";
import { requiresStaffContact, searchHelpFaqs } from "../../../lib/help/search";
import { ContactFallback } from "./ContactFallback";
import { FaqResultCard } from "./FaqResultCard";

const quickTopics: HelpCategory[] = ["sponsorship", "adoption", "tax_receipt", "donation", "contact"];

const popularFaqIds = [
  "sponsorship-start",
  "adoption-apply",
  "tax-receipt-eligibility",
  "donation-methods",
];

const topicPrompts: Record<HelpCategory, Record<HelpLanguage, string>> = {
  sponsorship: { "zh-HK": "助養", en: "sponsorship" },
  adoption: { "zh-HK": "領養", en: "adoption" },
  tax_receipt: { "zh-HK": "報稅收據", en: "tax receipt" },
  donation: { "zh-HK": "捐款方法", en: "donation methods" },
  contact: { "zh-HK": "聯絡職員", en: "contact staff" },
};

export function HelpSearch({
  language,
  compact = false,
  surface,
}: {
  language: HelpLanguage;
  compact?: boolean;
  surface: "widget" | "page";
}) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const resultLimit = compact ? 3 : 8;

  const response = useMemo(
    () => searchHelpFaqs(submittedQuery, { language, limit: resultLimit }),
    [language, resultLimit, submittedQuery],
  );

  const popularFaqs = useMemo(
    () =>
      popularFaqIds
        .map((id) => helpFaqs.find((faq) => faq.id === id))
        .filter((faq): faq is (typeof helpFaqs)[number] => Boolean(faq)),
    [],
  );

  function runSearch(nextQuery = query) {
    const normalizedQuery = nextQuery.trim();
    setSubmittedQuery(nextQuery);

    if (!normalizedQuery) {
      return;
    }

    const nextResponse = searchHelpFaqs(nextQuery, { language, limit: resultLimit });
    trackHelpEvent("help_search", {
      language,
      resultCount: nextResponse.results.length,
      confidenceBucket: nextResponse.confidence,
      query: nextQuery,
    });
  }

  function handleTopicClick(category: HelpCategory) {
    const nextQuery = topicPrompts[category][language];
    setQuery(nextQuery);
    runSearch(nextQuery);
  }

  const hasQuery = submittedQuery.trim().length > 0;
  const directResult = response.confidence === "high" ? response.results[0] : undefined;
  const showRelated = hasQuery && !directResult && response.results.length > 0;
  const showFallback =
    hasQuery &&
    (response.confidence === "low" ||
      response.confidence === "none" ||
      requiresStaffContact(submittedQuery));

  const inputId = `${surface}-help-query`;
  const compactInputClass =
    "min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";
  const pageInputClass =
    "min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-base focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-wrap gap-2">
        {quickTopics.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => handleTopicClick(category)}
            className="whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-panel)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {helpCategoryLabels[category][language]}
          </button>
        ))}
      </div>

      <form
        className={`flex gap-2 ${compact ? "items-stretch" : "items-center"}`}
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {language === "zh-HK" ? "輸入問題" : "Enter your question"}
        </label>
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            language === "zh-HK"
              ? "輸入助養、領養、報稅收據或捐款問題"
              : "Ask about sponsorship, adoption, tax receipts, or donations"
          }
          className={compact ? compactInputClass : pageInputClass}
        />
        <button
          type="submit"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          aria-label={language === "zh-HK" ? "搜尋" : "Search"}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {!hasQuery && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
              {language === "zh-HK" ? "常見問題" : "Popular questions"}
            </p>
            {popularFaqs.map((faq) => (
              <FaqResultCard key={faq.id} faq={faq} language={language} compact={compact} />
            ))}
          </div>
        )}

        {directResult && <FaqResultCard faq={directResult.faq} language={language} compact={compact} />}

        {showRelated && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-[var(--color-panel)]">
              {language === "zh-HK" ? "可能相關的答案" : "Related answers"}
            </p>
            {response.results.map((result) => (
              <FaqResultCard key={result.faq.id} faq={result.faq} language={language} compact={compact} />
            ))}
          </div>
        )}

        {showFallback && <ContactFallback language={language} query={submittedQuery} />}
      </div>

      <p className="rounded-lg bg-[var(--color-surface-offset)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
        {language === "zh-HK"
          ? "請不要在客服輸入姓名、電話、地址、付款參考、申請答案或上載檔案內容。"
          : "Please do not enter names, phone numbers, addresses, payment references, application answers, or uploaded-file details."}
      </p>
    </div>
  );
}
