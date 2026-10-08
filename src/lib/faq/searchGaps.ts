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

export function createSearchGapService({ repo }: { repo: SearchGapRepository }) {
  return {
    async listReport(): Promise<SearchGapReport> {
      const gaps = await repo.list(SEARCH_GAP_REPORT_DAYS, SEARCH_GAP_REPORT_LIMIT);
      return { days: SEARCH_GAP_REPORT_DAYS, gaps };
    },
  };
}
