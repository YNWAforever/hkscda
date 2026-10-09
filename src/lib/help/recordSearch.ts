import { trackHelpEvent } from "./analytics";
import type { HelpLanguage } from "./faq";
import type { HelpSearchResponse } from "./search";
import { reportSearchGap } from "./searchGapBeacon";

/**
 * Everything the help search records once a query has run: the GA event, and
 * the search-gap beacon (which sends nothing unless the search found no answer
 * or only a weak one).
 */
export function recordHelpSearch(
  input: { query: string; language: HelpLanguage; response: HelpSearchResponse },
  deps: { track?: typeof trackHelpEvent; reportGap?: typeof reportSearchGap } = {},
): void {
  const { query, language, response } = input;
  const track = deps.track ?? trackHelpEvent;
  const reportGap = deps.reportGap ?? reportSearchGap;

  track("help_search", {
    language,
    resultCount: response.results.length,
    confidenceBucket: response.confidence,
    query,
  });
  reportGap({ query, language, confidence: response.confidence });
}
