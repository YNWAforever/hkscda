import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before = process.argv.includes("--before");
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let calls = 0,
      release;
    const first = new Promise((r) => {
      release = r;
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      assert.equal(url.pathname, "/api/admin/supporters/format-preview");
      assert.equal(route.request().method(), "POST");
      const number = ++calls,
        input = route.request().postDataJSON();
      if (number === 1) await first;
      if (number === 3) return route.fulfill({ status: 503, json: { error: "合成讀取暫停" } });
      const marker = number === 1 ? "OLD" : "NEW";
      const items = input.ids.map((entityId, i) => ({
        entityId,
        status: ["suggested", "manual_review", "unchanged", "skipped"][i % 4],
        before:
          i % 4 === 3
            ? null
            : { name: marker + i, email: "TEST@example.invalid", phone: " 9123  4567 " },
        after:
          i % 4 === 3
            ? null
            : { name: marker + i, email: "test@example.invalid", phone: "9123 4567" },
        updatedAt: "2026-09-30",
      }));
      return route.fulfill({
        json: {
          filterHash: input.filterHash,
          generatedAt: "2026-09-30",
          counts: { suggested: 250, manual_review: 250, unchanged: 250, skipped: 250 },
          items,
        },
      });
    });
    await page.goto("http://127.0.0.1:56574/scripts/fixtures/contact-format.html");
    const preview = page.getByRole("button", { name: "預覽格式建議", exact: true });
    await preview.click();
    await page.waitForFunction(() => document.body.textContent.includes("正在檢查"));
    await page.getByRole("button", { name: "切換範圍" }).click();
    await page.getByRole("button", { name: "切換範圍" }).click();
    await preview.click();
    await page
      .getByText("NEW0 / TEST@example.invalid / 9123  4567", { exact: false })
      .first()
      .waitFor();
    release();
    await page.waitForLoadState("networkidle");
    const stale = await page.locator("tbody").getByText(/OLD/).count();
    const axe = await new AxeBuilder({ page }).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const rows = await page.locator("tbody tr").count();
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-contact-format-${before ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    if (!before) {
      const region = page.getByRole("region", { name: "聯絡資料格式比較" });
      await region.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await region.evaluate((el) => el === document.activeElement), true);
      await page.getByRole("button", { name: "下一頁", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByText("第 2 / 40 頁").waitFor();
      await preview.click();
      await page.getByRole("alert").waitFor();
      await preview.click();
      await page.getByText("第 1 / 40 頁").waitFor();
      await page.getByRole("button", { name: "切換頁面" }).click();
      await page.getByRole("button", { name: "切換頁面" }).click();
      assert.equal(await page.locator("tbody").count(), 0);
    }
    results.push({
      width,
      stale,
      rows,
      pages: 40,
      axe: axe.violations.map((v) => v.id),
      overflow,
      errors,
      calls,
    });
    await context.close();
  }
  console.log(JSON.stringify(results));
  assert.ok(
    results.every(
      (r) =>
        r.stale === 0 &&
        r.rows === 25 &&
        !r.overflow &&
        r.axe.length === 0 &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
