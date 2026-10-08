import { gtagEvent } from "../analytics";
import type { HelpCategory, HelpLanguage } from "./faq";
import { sanitizeHelpQuery } from "./sanitizeQuery";
import type { HelpSearchConfidence } from "./search";

// The sanitiser lives in ./sanitizeQuery so the server can run the same code on
// search-gap beacons; it stays exported from here for existing callers.
export { sanitizeHelpQuery } from "./sanitizeQuery";
export type { SanitizedHelpQuery } from "./sanitizeQuery";

export type HelpAnalyticsAction =
  | "help_widget_open"
  | "help_search"
  | "help_result_click"
  | "help_cta_click"
  | "help_contact_fallback";

export type HelpAnalyticsParams = {
  faqId?: string;
  category?: HelpCategory;
  language?: HelpLanguage;
  resultCount?: number;
  confidenceBucket?: HelpSearchConfidence;
  pagePath?: string;
  query?: string;
};

export function trackHelpEvent(action: HelpAnalyticsAction, params: HelpAnalyticsParams = {}) {
  const sanitized = params.query ? sanitizeHelpQuery(params.query) : undefined;
  const pagePath =
    params.pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined);

  gtagEvent(action, {
    faq_id: params.faqId,
    category: params.category,
    language: params.language,
    result_count: params.resultCount,
    confidence_bucket: params.confidenceBucket,
    page_path: pagePath,
    redacted: sanitized?.redacted ?? false,
    query_topic: sanitized && !sanitized.redacted ? sanitized.queryTopic : undefined,
  });
}
