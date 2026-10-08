import type { HelpLanguage } from "./faq";
import { sanitizeHelpQuery } from "./sanitizeQuery";
import type { HelpSearchConfidence } from "./search";

// Browser-side half of the FAQ search-gap report. When a search ends with no
// answer (`none`) or a weak one (`low`), send the *sanitised topic* -- never the
// raw query -- so staff can see what visitors look for and cannot find.
//
// Fire and forget: a failed beacon must never affect the search itself.

const SEARCH_GAP_ENDPOINT = "/api/help/search-gap";

export function reportSearchGap(
  input: { query: string; language: HelpLanguage; confidence: HelpSearchConfidence },
  deps: { fetch?: typeof fetch } = {},
): void {
  try {
    if (input.confidence !== "none" && input.confidence !== "low") return;

    const sanitized = sanitizeHelpQuery(input.query);
    if (sanitized.redacted) return;

    const send = deps.fetch ?? globalThis.fetch;
    send(SEARCH_GAP_ENDPOINT, {
      method: "POST",
      // The page may navigate away straight after a search; keep the request alive.
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: sanitized.queryTopic,
        language: input.language,
        confidence: input.confidence,
      }),
    }).catch(() => {});
  } catch {
    // A telemetry failure is not worth surfacing to the visitor.
  }
}
