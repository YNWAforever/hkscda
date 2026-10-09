import { requiresStaffContact, type HelpSearchResponse, type HelpSearchResult } from "./search";

export type HelpOutcome = {
  /** The single answer shown on its own, when the search is confident. */
  direct: HelpSearchResult | undefined;
  /** The weaker matches listed as related answers, when there is no direct answer. */
  related: HelpSearchResult[];
  /** Whether the contact-staff fallback is shown. */
  showFallback: boolean;
};

/**
 * What a visitor sees for a finished search. The public help search and the
 * admin answer tester both read this, so what staff test is what visitors get.
 */
export function describeHelpOutcome(
  response: HelpSearchResponse,
  submittedQuery: string,
): HelpOutcome {
  const hasQuery = submittedQuery.trim().length > 0;
  const direct = response.confidence === "high" ? response.results[0] : undefined;
  const related = hasQuery && !direct ? response.results : [];
  const showFallback =
    hasQuery &&
    (response.confidence === "low" ||
      response.confidence === "none" ||
      requiresStaffContact(submittedQuery));

  return { direct, related, showFallback };
}
