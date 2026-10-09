import type { SearchGap } from "../../../lib/faq/searchGaps";
import type { FaqLanguage } from "../../../lib/faq/types";

// Kept out of FaqSearchGapsReport.tsx: a component file that also exports a
// function loses fast refresh (react-refresh/only-export-components).

export type SearchGapRowCallbacks = {
  /** Fills the answer tester with the topic, so staff can see what visitors saw. */
  onTest(topic: string, language: FaqLanguage): void;
  /** Opens a new FAQ draft with the topic as its question. */
  onCreate(topic: string, language: FaqLanguage): void;
};

/** The two row buttons' click handlers, kept pure so they can be tested without a DOM. */
export function searchGapRowActions(
  gap: Pick<SearchGap, "topic" | "language">,
  { onTest, onCreate }: SearchGapRowCallbacks,
) {
  return {
    onTest: () => onTest(gap.topic, gap.language),
    onCreate: () => onCreate(gap.topic, gap.language),
  };
}
