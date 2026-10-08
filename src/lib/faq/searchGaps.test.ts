import { describe, expect, mock, test } from "bun:test";

import {
  createSearchGapService,
  SEARCH_GAP_REPORT_DAYS,
  SEARCH_GAP_REPORT_LIMIT,
  type SearchGap,
  type SearchGapRepository,
} from "./searchGaps";

const gap: SearchGap = {
  topic: "visa",
  language: "en",
  confidence: "none",
  searchCount: 4,
  lastSeenDay: "2026-10-08",
};

function createRepo(gaps: SearchGap[]) {
  const list = mock(async (_days: number, _limit: number) => gaps);
  const repo: SearchGapRepository = {
    record: mock(async () => {}),
    list,
    purge: mock(async () => 0),
  };
  return { repo, list };
}

describe("createSearchGapService", () => {
  test("listReport reads the 30-day window with a 100-row limit, once", async () => {
    const { repo, list } = createRepo([gap]);

    const report = await createSearchGapService({ repo }).listReport();

    expect(report).toEqual({ days: 30, gaps: [gap] });
    expect(SEARCH_GAP_REPORT_DAYS).toBe(30);
    expect(SEARCH_GAP_REPORT_LIMIT).toBe(100);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(30, 100);
  });

  test("listReport returns an empty gap list when nothing was recorded", async () => {
    const { repo } = createRepo([]);

    expect(await createSearchGapService({ repo }).listReport()).toEqual({ days: 30, gaps: [] });
  });
});
