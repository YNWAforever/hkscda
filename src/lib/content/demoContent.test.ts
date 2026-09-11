import { describe, expect, test } from "bun:test";

import {
  demoMarkers,
  isDemoContent,
  publishedDemoContent,
  type DemoContentCandidate,
} from "./demoContent";

function item(overrides: Partial<DemoContentCandidate> = {}): DemoContentCandidate {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    title: "真實救援故事",
    slug: "real-rescue-story",
    status: "published",
    ...overrides,
  };
}

describe("identifying demonstration content", () => {
  test("catches the seven production fixtures by both of their markers", () => {
    // Every seeded fixture carries a 【示範】 title prefix AND a demo- slug.
    const siuBak = item({ title: "【示範】小白康復中", slug: "demo-siu-bak-recovery" });
    expect(demoMarkers(siuBak)).toEqual(["title", "slug"]);
    expect(isDemoContent(siuBak)).toBe(true);
  });

  test("still catches a row whose visible label was stripped", () => {
    // The plan is explicit: "Do not merely remove the 「【示範】」 label." A row
    // edited that way is exactly the case a title-only check would miss.
    const relabelled = item({ title: "小白康復中", slug: "demo-siu-bak-recovery" });
    expect(demoMarkers(relabelled)).toEqual(["slug"]);
    expect(isDemoContent(relabelled)).toBe(true);
  });

  test("still catches a row whose slug was changed but label left", () => {
    const reslugged = item({ title: "【示範】夏日領養日", slug: "summer-adoption-day" });
    expect(demoMarkers(reslugged)).toEqual(["title"]);
    expect(isDemoContent(reslugged)).toBe(true);
  });

  test("does not sweep up genuine content that merely mentions a demo", () => {
    // Anchored to the start of the slug, so a real article about a
    // demonstration day is not misclassified and quietly pulled from the site.
    expect(isDemoContent(item({ title: "領養日示範活動回顧", slug: "adoption-demo-day" }))).toBe(
      false,
    );
    expect(isDemoContent(item())).toBe(false);
  });

  test("tolerates null title and slug", () => {
    expect(isDemoContent({ title: null, slug: null })).toBe(false);
  });
});

describe("publishedDemoContent", () => {
  test("reports only what a visitor can actually see", () => {
    const rows = [
      item({ id: "a", title: "【示範】小白康復中", slug: "demo-siu-bak-recovery" }),
      // A draft fixture is legitimate: the plan preserves history rather than
      // deleting records, so only published demo content is a defect.
      item({ id: "b", title: "【示範】草稿", slug: "demo-draft", status: "draft" }),
      item({ id: "c" }),
    ];
    expect(publishedDemoContent(rows).map((r) => r.id)).toEqual(["a"]);
  });

  test("returns nothing when the public site is clean", () => {
    expect(publishedDemoContent([item(), item({ id: "b" })])).toEqual([]);
  });
});
