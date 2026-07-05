import { describe, expect, test } from "bun:test";

import {
  buildContentSearchParams,
  contentStatusTone,
  formatContentTypeLabel,
  summarizeContentRows,
} from "./contentAdminLogic";

describe("contentAdminLogic", () => {
  test("builds bounded content search params", () => {
    expect(
      buildContentSearchParams({
        q: "  小白 ",
        type: "rescue_story",
        status: "published",
        rescueRegion: "灣仔",
        page: 2,
      }).toString(),
    ).toBe(
      "q=%E5%B0%8F%E7%99%BD&type=rescue_story&status=published&rescueRegion=%E7%81%A3%E4%BB%94&page=2&pageSize=25",
    );
  });

  test("formats status tones and content type labels", () => {
    expect(contentStatusTone("published")).toBe("success");
    expect(contentStatusTone("draft")).toBe("warning");
    expect(contentStatusTone("archived")).toBe("muted");
    expect(formatContentTypeLabel("charity_market", "zh")).toBe("慈善市集");
    expect(formatContentTypeLabel("report", "en")).toBe("Report");
  });

  test("summarizes content rows", () => {
    expect(
      summarizeContentRows([
        { type: "rescue_story", status: "published" },
        { type: "rescue_story", status: "draft" },
        { type: "event", status: "published" },
      ]),
    ).toEqual({ total: 3, published: 2, drafts: 1, rescueStories: 2 });
  });
});
