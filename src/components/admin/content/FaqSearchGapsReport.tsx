import { useId } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { SearchGapConfidence, SearchGapReport } from "../../../lib/faq/searchGaps";
import type { FaqLanguage } from "../../../lib/faq/types";
import { Button } from "../../ui/button";
import { LoadFailure } from "../LoadFailure";
import { searchGapRowActions, type SearchGapRowCallbacks } from "./faqSearchGapsLogic";

export const ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY = ["admin-faq-search-gaps"] as const;

const CONFIDENCE_LABELS: Record<SearchGapConfidence, string> = {
  none: "沒有答案",
  low: "配對較弱",
};

const LANGUAGE_LABELS: Record<FaqLanguage, string> = {
  "zh-HK": "中文",
  en: "English",
};

export type FaqSearchGapsReportProps = SearchGapRowCallbacks;

/**
 * Staff-only report of the topics visitors searched for in the last 30 days and
 * found no answer (or only a weak one) to. It reads only the sanitised topics the
 * public search recorded, never the raw queries.
 */
export function FaqSearchGapsReport({ onTest, onCreate }: FaqSearchGapsReportProps) {
  const id = useId();
  const reportQuery = useQuery({
    queryKey: ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY,
    queryFn: () => fetchAdminJson<SearchGapReport>("/api/admin/faq/search-gaps"),
  });
  const gaps = reportQuery.data?.gaps;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h2 id={`${id}-heading`} className="text-base font-bold text-[var(--color-text)]">
        搜尋未有答案的主題（過去 30 日）
      </h2>

      {reportQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">載入中…</p>
      ) : null}
      {reportQuery.isError ? (
        <LoadFailure
          error={reportQuery.error}
          onRetry={() => void reportQuery.refetch()}
          title="無法載入搜尋主題報告"
        />
      ) : null}

      {gaps && gaps.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">過去 30 日未有訪客搜尋找不到答案。</p>
      ) : null}

      {gaps && gaps.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th scope="col" className="py-2 pr-3">
                  主題
                </th>
                <th scope="col" className="py-2 pr-3">
                  語言
                </th>
                <th scope="col" className="py-2 pr-3">
                  結果
                </th>
                <th scope="col" className="py-2 pr-3">
                  搜尋次數
                </th>
                <th scope="col" className="py-2 pr-3">
                  最近一日
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => {
                const actions = searchGapRowActions(gap, { onTest, onCreate });
                return (
                  <tr
                    key={`${gap.language}:${gap.confidence}:${gap.topic}`}
                    className="border-b border-[var(--color-border)]"
                  >
                    <td className="py-2 pr-3 break-words text-[var(--color-text)]">{gap.topic}</td>
                    <td className="py-2 pr-3">{LANGUAGE_LABELS[gap.language]}</td>
                    <td className="py-2 pr-3">{CONFIDENCE_LABELS[gap.confidence]}</td>
                    <td className="py-2 pr-3">{gap.searchCount}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{gap.lastSeenDay}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`測試「${gap.topic}」`}
                          onClick={actions.onTest}
                        >
                          測試
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`以此新增問題「${gap.topic}」`}
                          onClick={actions.onCreate}
                        >
                          以此新增問題
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
