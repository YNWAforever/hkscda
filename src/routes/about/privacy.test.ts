import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = readFileSync(join(process.cwd(), "src/routes/about/privacy.tsx"), "utf8");

describe("privacy notice FAQ search disclosure", () => {
  test("states the October 2026 update", () => {
    expect(source).toContain("最後更新：2026年10月");
    expect(source).not.toContain("最後更新：2026年6月");
  });

  test("discloses the sanitised FAQ search topics and their 90-day deletion", () => {
    expect(source).toContain("6. 常見問題搜尋");
    expect(source).toContain(
      "當您使用網站的常見問題搜尋而未找到合適答案時，我們會保存已移除個人資料的搜尋主題、所用語言及日期，以了解需要補充哪些答案。我們不會一併保存您的 IP 位址或任何可識別您身分的資料，並會在 90 日內刪除這些記錄。請勿在搜尋中輸入個人資料。",
    );
  });

  test("renumbers the access and correction section to 7", () => {
    expect(source).toContain("7. 查閱及更正權利");
    expect(source).not.toContain("6. 查閱及更正權利");
  });
});
