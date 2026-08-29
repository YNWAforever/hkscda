import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Plan blockers P0-04 and P0-05: a public page must not state a figure or a
 * person it cannot verify. Both defects here published something false rather
 * than nothing, which is the harder failure to notice.
 */
describe("public pages do not publish unverified facts", () => {
  test("the adoption report does not read a status RLS forbids", () => {
    const source = read("src/routes/report/adoption.tsx");

    // The anon policy exposes only available animals, so this query could only
    // ever return empty - and the page rendered that emptiness as 0 adoptions.
    expect(source).not.toContain('"adopted"');
    expect(source).not.toContain("useQuery");
    expect(source).toContain("暫未發佈");
  });

  test("the adoption report explains its methodology instead of estimating", () => {
    const source = read("src/routes/report/adoption.tsx");
    expect(source).toContain("統計口徑");
    expect(source).toContain("不會以零值、舊數字或估算數字代替");
  });

  test("the team page does not assert board members from page source", () => {
    const source = read("src/routes/about/team.tsx");

    // Real people and an accountability claim; publishing them from hardcoded
    // source leaves no record of who approved the list or when.
    expect(source).not.toContain("謝曉梅");
    expect(source).not.toContain("鄧殷");
    expect(source).toContain("尚未有公開資料");
  });

  test("contact details on these pages come from the brand constants", () => {
    const team = read("src/routes/about/team.tsx");
    expect(team).toContain("brand.org.email");
    expect(team).not.toContain("info@hkscda.com");
  });
});
