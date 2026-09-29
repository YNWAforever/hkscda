import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch();
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:56552/scripts/fixtures/public-listing.html", {
      waitUntil: "networkidle",
    });
    const images = page.locator(".animal-profile-grid img");
    assert.equal(await images.count(), 16);
    assert.equal(await images.first().getAttribute("loading"), "eager");
    assert.equal(await images.first().getAttribute("fetchpriority"), "high");
    assert.equal(await images.nth(1).getAttribute("loading"), "lazy");
    const first = await images.first().getAttribute("alt");
    await page.getByRole("button", { name: "下一頁", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (first) => document.querySelector(".animal-profile-grid img")?.getAttribute("alt") !== first,
      first,
    );
    assert.equal(await images.count(), 16);
    await page.getByRole("button", { name: "上一頁", exact: true }).click();
    await page.waitForFunction(
      (first) => document.querySelector(".animal-profile-grid img")?.getAttribute("alt") === first,
      first,
    );
    const search = page.getByRole("searchbox");
    await search.fill("合成貓咪 34");
    await search.press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll(".animal-profile-grid img").length === 1,
    );
    await page.getByRole("button", { name: "清除全部", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".animal-profile-grid img").length === 16,
    );
    assert.equal((await page.locator("body").innerText()).includes("private-marker"), false);
    const measure = () =>
      page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    let m = await measure();
    assert.ok(m.scroll <= m.viewport + 1);
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t21-public-listing-sequential-${width}.png`,
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
        width,
        cards: 16,
        keyboardPagination: true,
        searchClear: true,
        imagePriority: true,
        noOverflow: true,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
