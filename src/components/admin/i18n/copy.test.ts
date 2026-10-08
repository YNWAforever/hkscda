import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { defineAdminCopy, pickAdminCopy, useAdminCopy } from "./copy";
import { renderAdminInChinese, renderAdminInEnglish } from "./testing";

const sample = defineAdminCopy({ zh: { a: "甲" }, en: { a: "A" } });

function SampleProbe() {
  return createElement("p", null, useAdminCopy(sample).a);
}

describe("pickAdminCopy", () => {
  test("returns the English half for en and the Chinese half for zh", () => {
    expect(pickAdminCopy(sample, "en").a).toBe("A");
    expect(pickAdminCopy(sample, "zh").a).toBe("甲");
  });

  test("returns functions that interpolate counts", () => {
    const counts = defineAdminCopy({
      zh: { selected: (count: number) => `已選 ${count} 項` },
      en: { selected: (count: number) => `${count} selected` },
    });
    expect(pickAdminCopy(counts, "en").selected(3)).toBe("3 selected");
    expect(pickAdminCopy(counts, "zh").selected(3)).toBe("已選 3 項");
  });
});

describe("useAdminCopy", () => {
  test("returns the English half inside an English provider", () => {
    expect(renderAdminInEnglish(createElement(SampleProbe))).toBe("<p>A</p>");
  });

  test("returns the Chinese half inside a Chinese provider", () => {
    expect(renderAdminInChinese(createElement(SampleProbe))).toBe("<p>甲</p>");
  });
});

describe("defineAdminCopy", () => {
  test("returns both halves unchanged", () => {
    const zh = { a: "甲" };
    const en = { a: "A" };
    const module = defineAdminCopy({ zh, en });
    expect(module.zh).toBe(zh);
    expect(module.en).toBe(en);
  });

  // `tsc` enforces this test: each `@ts-expect-error` below must sit on a real type
  // error, or `tsc` fails with "Unused '@ts-expect-error' directive". Bun only
  // transpiles, so nothing here fails at runtime. Each call stays on one line, because a
  // directive covers only the line after it.
  test("rejects a missing, extra or mistyped key in either language at compile time", () => {
    const nestedZh = { card: { title: "標題", hint: "提示" } };
    const countZh = { n: (count: number) => `${count}` };

    // @ts-expect-error en is missing the key `a`
    defineAdminCopy({ zh: { a: "甲" }, en: {} });

    // @ts-expect-error zh is missing the key `a`, which en has
    defineAdminCopy({ zh: { b: "乙" }, en: { a: "A", b: "B" } });

    // @ts-expect-error en has a key that zh does not
    defineAdminCopy({ zh: { a: "甲" }, en: { a: "A", extra: "X" } });

    // @ts-expect-error the nested key `title` is missing from en
    defineAdminCopy({ zh: nestedZh, en: { card: { hint: "Hint" } } });

    // @ts-expect-error the two languages disagree on the function signature
    defineAdminCopy({ zh: countZh, en: { n: (label: string) => label } });

    // @ts-expect-error a string cannot stand in for a function
    defineAdminCopy({ zh: countZh, en: { n: "n" } });

    expect(defineAdminCopy({ zh: { a: "甲" }, en: { a: "A" } }).en.a).toBe("A");
  });
});
