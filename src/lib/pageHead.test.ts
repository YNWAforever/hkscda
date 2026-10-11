import { describe, expect, test } from "bun:test";

import { ownPageHead, pageHead } from "./pageHead";
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
    expect(head.meta).toContainEqual({ property: "og:url", content: publicUrl("/animals/cat") });
    expect(head.links).toEqual([{ rel: "canonical", href: publicUrl("/animals/cat") }]);
  });

  test("share cards can carry a shorter line and an absolute image", () => {
    const head = pageHead({
      title: "捐助我們",
      description: "Long",
      shareDescription: "Short",
      image: "/assets/dog.jpg",
      path: "/donate",
    });

    expect(head.meta).toContainEqual({ name: "description", content: "Long" });
    expect(head.meta).toContainEqual({ property: "og:description", content: "Short" });
    expect(head.meta).toContainEqual({ name: "twitter:description", content: "Short" });
    expect(head.meta).toContainEqual({
      property: "og:image",
      content: publicUrl("/assets/dog.jpg"),
    });
    expect(head.meta).toContainEqual({
      name: "twitter:image",
      content: publicUrl("/assets/dog.jpg"),
    });
  });

  test("without an image the root default share image applies", () => {
    const head = pageHead({ title: "x", description: "D", path: "/x" });
    expect(JSON.stringify(head.meta)).not.toContain("image");
  });

  test("a missing, empty or blank description leaves the description tags out", () => {
    for (const description of [undefined, "", "   "]) {
      const head = pageHead({ title: "使命與歷史", description, path: "/about" });

      expect(head.meta).toEqual([
        { title: "使命與歷史 · 香港拯救貓狗協會 HKSCDA" },
        { property: "og:title", content: "使命與歷史 · HKSCDA" },
        { name: "twitter:title", content: "使命與歷史 · HKSCDA" },
        { property: "og:url", content: publicUrl("/about") },
      ]);
      expect(head.links).toEqual([{ rel: "canonical", href: publicUrl("/about") }]);
    }
    expect(pageHead({ title: "使命與歷史", path: "/about" }).meta).toHaveLength(4);
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

  test("a layout's own head applies only when it is the page being shown", () => {
    const head = pageHead({ title: "救援個案", path: "/stories" });
    const layout = { id: "/stories" };

    expect(ownPageHead({ match: layout, matches: [{ id: "__root__" }, layout] }, head)).toBe(head);
    expect(
      ownPageHead(
        { match: layout, matches: [{ id: "__root__" }, layout, { id: "/stories/$slug" }] },
        head,
      ),
    ).toEqual({});
  });
});
