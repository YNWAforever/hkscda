import { sanitizeHelpQuery } from "../help/sanitizeQuery";
import { searchGapBeaconSchema } from "./schemas";
import type { FaqLanguage } from "./types";

// Isomorphic: no Supabase import, so the admin UI can share these types.
//
// A "search gap" is a topic visitors searched for in the help FAQ and got no
// answer (`none`) or only a weak one (`low`). Only the sanitised topic is ever
// stored -- never the raw query, IP address, user agent, session or page path.

export type SearchGapConfidence = "none" | "low";

export type SearchGap = {
  topic: string;
  language: FaqLanguage;
  confidence: SearchGapConfidence;
  searchCount: number;
  lastSeenDay: string;
};

export type SearchGapReport = { days: number; gaps: SearchGap[] };

export type SearchGapRecord = {
  topic: string;
  language: FaqLanguage;
  confidence: SearchGapConfidence;
};

export const SEARCH_GAP_REPORT_DAYS = 30;
export const SEARCH_GAP_REPORT_LIMIT = 100;

export interface SearchGapRepository {
  record(input: SearchGapRecord): Promise<void>;
  list(days: number, limit: number): Promise<SearchGap[]>;
  purge(): Promise<number>;
}

// Postgres rejects text with an unpaired UTF-16 surrogate, so one in a topic
// would turn into a failed insert. Well-formed pairs are matched first and kept.
// (No lookbehind: this file is bundled for the admin UI, and older Safari
// cannot even parse a regex literal that uses one.)
function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) =>
    match.length === 2 ? match : "",
  );
}

export function createSearchGapService({ repo }: { repo: SearchGapRepository }) {
  return {
    async listReport(): Promise<SearchGapReport> {
      const gaps = await repo.list(SEARCH_GAP_REPORT_DAYS, SEARCH_GAP_REPORT_LIMIT);
      return { days: SEARCH_GAP_REPORT_DAYS, gaps };
    },

    /**
     * Records one beacon from the public help search. `input` is untrusted JSON,
     * so the body is validated here (a `ZodError` means a malformed request) and
     * the topic is sanitised again: the server never relies on the browser having
     * done it.
     */
    async record(input: unknown): Promise<"recorded" | "dropped"> {
      const beacon = searchGapBeaconSchema.parse(input);

      // Strip before sanitising so the personal-data patterns see the text that
      // would be stored; otherwise a surrogate between digits hides a phone number.
      const sanitized = sanitizeHelpQuery(stripLoneSurrogates(beacon.topic));
      if (sanitized.redacted) return "dropped";

      // The sanitiser truncates to 80 UTF-16 units, which can split a pair.
      const topic = stripLoneSurrogates(sanitized.queryTopic).trim();
      if (!topic) return "dropped";

      await repo.record({ topic, language: beacon.language, confidence: beacon.confidence });
      return "recorded";
    },
  };
}
