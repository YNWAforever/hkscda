import { describe, expect, test } from "bun:test";

import {
  buildContentSearchParams,
  contentOptionalFieldLabels,
  contentStatusTone,
  copyTextToClipboard,
  formatContentTypeLabel,
  formatIsoForDatetimeLocal,
  parseDatetimeLocalToIso,
  suggestSlug,
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

  test("converts ISO timestamps to datetime-local values without UTC display drift", () => {
    const iso = "2026-06-20T08:30:00.000Z";
    const local = formatIsoForDatetimeLocal(iso);

    expect(parseDatetimeLocalToIso(local)).toBe(iso);
  });

  test("copies text through an injected clipboard and rejects failures", async () => {
    const writes: string[] = [];
    const clipboard = {
      writeText: async (text: string) => {
        writes.push(text);
      },
    };

    await expect(copyTextToClipboard("小白更新", clipboard)).resolves.toBeUndefined();
    expect(writes).toEqual(["小白更新"]);

    await expect(
      copyTextToClipboard("失敗", {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      }),
    ).rejects.toThrow("clipboard blocked");
  });
});

describe("contentOptionalFieldLabels", () => {
  test("labels every optional content field", () => {
    expect(Object.keys(contentOptionalFieldLabels).sort()).toEqual([
      "ctaLabel",
      "ctaUrl",
      "ogDescription",
      "ogTitle",
      "seoDescription",
      "seoTitle",
    ]);
    for (const label of Object.values(contentOptionalFieldLabels)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("suggestSlug", () => {
  test("kebab-cases an ASCII title", () => {
    expect(suggestSlug("Rescue Story: Milo's New Home!")).toBe("rescue-story-milo-s-new-home");
  });
  test("returns an empty string for a purely CJK title (staff must type a slug)", () => {
    expect(suggestSlug("米路的新家")).toBe("");
  });
  test("strips leading/trailing separators and caps length", () => {
    const slug = suggestSlug("  --Hello, World--  " + "x".repeat(220));
    expect(slug.startsWith("hello-world")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(180);
    expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).toBe(true);
  });
});
