import { useId } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { SearchGapReport } from "../../../lib/faq/searchGaps";
import { Button } from "../../ui/button";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { faqCopy } from "./faqCopy";
import { searchGapRowActions, type SearchGapRowCallbacks } from "./faqSearchGapsLogic";

export const ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY = ["admin-faq-search-gaps"] as const;

export type FaqSearchGapsReportProps = SearchGapRowCallbacks;

/**
 * Staff-only report of the topics visitors searched for in the last 30 days and
 * found no answer (or only a weak one) to. It reads only the sanitised topics the
 * public search recorded, never the raw queries.
 */
export function FaqSearchGapsReport({ onTest, onCreate }: FaqSearchGapsReportProps) {
  const common = useAdminCopy(faqCopy);
  const copy = common.gaps;
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
        {copy.heading}
      </h2>

      {reportQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{copy.loading}</p>
      ) : null}
      {reportQuery.isError ? (
        <LoadFailure
          error={reportQuery.error}
          onRetry={() => void reportQuery.refetch()}
          title={copy.loadFailed}
        />
      ) : null}

      {gaps && gaps.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
      ) : null}

      {gaps && gaps.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th scope="col" className="py-2 pr-3">
                  {copy.topic}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {copy.language}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {copy.result}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {copy.searches}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {copy.lastSeen}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{copy.actions}</span>
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
                    <td className="py-2 pr-3">{common.languages[gap.language]}</td>
                    <td className="py-2 pr-3">{copy.confidence[gap.confidence]}</td>
                    <td className="py-2 pr-3">{copy.count(gap.searchCount)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{copy.day(gap.lastSeenDay)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={copy.testLabel(gap.topic)}
                          onClick={actions.onTest}
                        >
                          {copy.test}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={copy.createLabel(gap.topic)}
                          onClick={actions.onCreate}
                        >
                          {copy.create}
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
