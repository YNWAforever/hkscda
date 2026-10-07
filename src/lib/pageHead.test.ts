import { describe, expect, test } from "bun:test";

import { pageHead } from "./pageHead";
import { publicUrl } from "./publicOrigin";

describe("pageHead", () => {
  test("indexable pages get a suffixed title, description, social tags and canonical", () => {
    const head = pageHead({ title: "待領養貓貓", description: "D", path: "/animals/cat" });

    expect(head.meta).toContainEqual({ title: "待領養貓貓 · 香港拯救貓狗協會 HKSCDA" });
    expect(head.meta).toContainEqual({ name: "description", content: "D" });
    expect(head.meta).toContainEqual({ property: "og:title", content: "待領養貓貓 · HKSCDA" });
    expect(head.meta).toContainEqual({ property: "og:description", content: "D" });
    expect(head.meta).toContainEqual({ name: "twitter:title", content: "待領養貓貓 · HKSCDA" });
    expect(head.meta).toContainEqual({ name: "twitter:description", content: "D" });
    expect(head.links).toEqual([{ rel: "canonical", href: publicUrl("/animals/cat") }]);
  });

  test("a missing, empty or blank description leaves the description tags out", () => {
    for (const description of [undefined, "", "   "]) {
      const head = pageHead({ title: "使命與歷史", description, path: "/about" });

      expect(head.meta).toEqual([
        { title: "使命與歷史 · 香港拯救貓狗協會 HKSCDA" },
        { property: "og:title", content: "使命與歷史 · HKSCDA" },
        { name: "twitter:title", content: "使命與歷史 · HKSCDA" },
      ]);
      expect(head.links).toEqual([{ rel: "canonical", href: publicUrl("/about") }]);
    }
    expect(pageHead({ title: "使命與歷史", path: "/about" }).meta).toHaveLength(3);
  });

  test("private pages are noindex, no-referrer and carry no URL", () => {
    const head = pageHead({ title: "申請狀態", private: true });

    expect(head.meta).toEqual([
      { title: "申請狀態 · 香港拯救貓狗協會 HKSCDA" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ]);
    expect(head.links).toEqual([]);
    expect(JSON.stringify(head)).not.toContain("http");
  });
});
