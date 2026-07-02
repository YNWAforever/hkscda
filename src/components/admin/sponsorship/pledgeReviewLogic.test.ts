import { describe, expect, test } from "bun:test";

import {
  buildPledgeListSearchParams,
  formatFallback,
  formatDate,
  pledgeStatusTone,
} from "./pledgeReviewLogic";

describe("buildPledgeListSearchParams", () => {
  test("omits empty filters and applies page/pageSize defaults", () => {
    const params = buildPledgeListSearchParams({
      q: "",
      status: "",
      page: undefined,
      pageSize: undefined,
    });
    expect(params.has("q")).toBe(false);
    expect(params.has("status")).toBe(false);
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });

  test("includes a trimmed search query and status filter", () => {
    const params = buildPledgeListSearchParams({
      q: "  陳小姐  ",
      status: "provisional",
      page: 2,
      pageSize: 10,
    });
    expect(params.get("q")).toBe("陳小姐");
    expect(params.get("status")).toBe("provisional");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
  });

  test("falls back to page 1 / pageSize 25 for invalid numbers", () => {
    const params = buildPledgeListSearchParams({ page: 0, pageSize: -5 });
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });
});

describe("formatFallback", () => {
  test("returns a dash for empty or nullish values", () => {
    expect(formatFallback(null)).toBe("-");
    expect(formatFallback(undefined)).toBe("-");
    expect(formatFallback("   ")).toBe("-");
  });

  test("returns the trimmed value otherwise", () => {
    expect(formatFallback("  陳小姐  ")).toBe("陳小姐");
  });
});

describe("formatDate", () => {
  test("returns a dash for empty values", () => {
    expect(formatDate(null)).toBe("-");
  });

  test("truncates an ISO timestamp to the date portion", () => {
    expect(formatDate("2026-07-01T00:00:00.000Z")).toBe("2026-07-01");
  });
});

describe("pledgeStatusTone", () => {
  test("maps each status to its expected StatusPill tone", () => {
    expect(pledgeStatusTone("pending_payment")).toBe("warning");
    expect(pledgeStatusTone("provisional")).toBe("info");
    expect(pledgeStatusTone("active")).toBe("success");
    expect(pledgeStatusTone("needs_followup")).toBe("danger");
    expect(pledgeStatusTone("cancelled")).toBe("neutral");
  });
});
