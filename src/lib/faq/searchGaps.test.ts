import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";

import { sanitizeHelpQuery } from "../help/sanitizeQuery";
import {
  createSearchGapService,
  SEARCH_GAP_REPORT_DAYS,
  SEARCH_GAP_REPORT_LIMIT,
  type SearchGap,
  type SearchGapRecord,
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
  const record = mock(async (_input: SearchGapRecord) => {});
  const repo: SearchGapRepository = {
    record,
    list,
    purge: mock(async () => 0),
  };
  return { repo, list, record };
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

describe("createSearchGapService.record", () => {
  test("records the re-sanitised topic, not the topic as sent", async () => {
    const { repo, record } = createRepo([]);
    const expectedTopic = sanitizeHelpQuery("Adoption Fee?").queryTopic;

    const outcome = await createSearchGapService({ repo }).record({
      topic: "Adoption Fee?",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("recorded");
    expect(expectedTopic).toBe("adoption fee");
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      topic: expectedTopic,
      language: "en",
      confidence: "none",
    });
  });

  test("drops a topic that sanitises to redacted without touching the repository", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "call me 91234567",
      language: "en",
      confidence: "low",
    });

    expect(outcome).toBe("dropped");
    expect(record).not.toHaveBeenCalled();
  });

  test.each([
    ["an extra field", { topic: "visa", language: "en", confidence: "none", extra: 1 }],
    ["an 81-character topic", { topic: "a".repeat(81), language: "en", confidence: "none" }],
    ["an empty topic", { topic: "", language: "en", confidence: "none" }],
    ["an unsupported language", { topic: "visa", language: "fr", confidence: "none" }],
    ["an unsupported confidence", { topic: "visa", language: "en", confidence: "high" }],
    ["a non-object body", "visa"],
  ])("rejects %s with a ZodError and never records", async (_label, body) => {
    const { repo, record } = createRepo([]);

    await expect(createSearchGapService({ repo }).record(body)).rejects.toBeInstanceOf(z.ZodError);
    expect(record).not.toHaveBeenCalled();
  });

  test("strips a lone surrogate so Postgres never sees invalid UTF-8", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: `${"a".repeat(79)}\uD83D`,
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("recorded");
    const [input] = record.mock.calls[0] ?? [];
    expect(input?.topic).toBe("a".repeat(79));
    expect(input?.topic).not.toMatch(/[\uD800-\uDFFF]/);
  });

  test("strips a lone low surrogate but keeps a well-formed pair", async () => {
    const { repo, record } = createRepo([]);

    await createSearchGapService({ repo }).record({
      topic: "cat \uDC31 \u{1F431}",
      language: "en",
      confidence: "none",
    });

    const [input] = record.mock.calls[0] ?? [];
    expect(input?.topic).toBe("cat \u{1F431}");
  });

  test("strips a surrogate the sanitiser's own 80-character cut leaves behind", async () => {
    const { repo, record } = createRepo([]);

    // 79 code units pass the schema, but NFKC turns U+FB03 into "ffi" (+2), so
    // the sanitiser's slice(0, 80) keeps only the high half of the final emoji.
    await createSearchGapService({ repo }).record({
      topic: `${"a".repeat(76)}ﬃ\u{1F431}`,
      language: "en",
      confidence: "none",
    });

    const [input] = record.mock.calls[0] ?? [];
    expect(input?.topic).toBe(`${"a".repeat(76)}ffi`);
  });

  test("does not let a lone surrogate hide a phone number from the sanitiser", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "call 9123\uD8344567",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("dropped");
    expect(record).not.toHaveBeenCalled();
  });

  test("never records a NUL, which Postgres text cannot hold", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "visa\u0000",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("recorded");
    const [input] = record.mock.calls[0] ?? [];
    expect(input?.topic).toBe("visa");
  });

  test("strips a bidi override so a report row cannot render backwards", async () => {
    const { repo, record } = createRepo([]);

    await createSearchGapService({ repo }).record({
      topic: "‮evil",
      language: "en",
      confidence: "none",
    });

    const [input] = record.mock.calls[0] ?? [];
    expect(input?.topic).toBe("evil");
  });

  test("does not let a zero-width space hide a phone number from the sanitiser", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "call 9123​4567",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("dropped");
    expect(record).not.toHaveBeenCalled();
  });

  test("drops a topic that is nothing but control and format characters", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "\u0000​‮",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("dropped");
    expect(record).not.toHaveBeenCalled();
  });

  test("drops a topic that is nothing but a lone surrogate", async () => {
    const { repo, record } = createRepo([]);

    const outcome = await createSearchGapService({ repo }).record({
      topic: "\uD83D",
      language: "en",
      confidence: "none",
    });

    expect(outcome).toBe("dropped");
    expect(record).not.toHaveBeenCalled();
  });
});
