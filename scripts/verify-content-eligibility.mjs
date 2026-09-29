import assert from "node:assert/strict";
import { chromium } from "playwright";
const baseline = process.argv.includes("--baseline"),
  origin = process.env.CONTENT_TEST_ORIGIN ?? "http://127.0.0.1:56550";
if (new URL(origin).hostname !== "127.0.0.1") throw Error("Loopback fixture required");
const browser = await chromium.launch();
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/scripts/fixtures/content-eligibility.html", {
      waitUntil: "networkidle",
    });
    await page.getByText("合成已結束活動", { exact: true }).waitFor();
    for (const title of ["不可公開示範", "不可公開草稿", "不可公開未來"])
      assert.equal(await page.getByText(title, { exact: true }).count(), baseline ? 1 : 0);
    assert.equal(await page.getByRole("link", { name: "過期報名連結" }).count(), 0);
    for (const text of ["合成照顧需要", "合成助養用途", "合成復原近況"])
      await page.getByText(text, { exact: true }).waitFor();
    assert.equal(
      (await page.locator("body").innerText()).includes("private-internal-marker"),
      false,
    );
    const measure = () =>
      page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    let m = await measure();
    assert.ok(m.scroll <= m.viewport + 1);
    await page.screenshot({
      path:
        "docs/evidence/audit-remediation-20260927/ui/t18-content-" +
        (baseline ? "before" : "after") +
        "-" +
        width +
        ".png",
      fullPage: true,
    });
    if (width === 768) {
      await page.evaluate(() => (document.body.style.zoom = "200%"));
      m = await measure();
      assert.ok(m.scroll <= m.viewport + 1);
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        baseline,
        width,
        invalidArchiveItems: baseline ? 3 : 0,
        noOverflow: true,
        errors: 0,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
