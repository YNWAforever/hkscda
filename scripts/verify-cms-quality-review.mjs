import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let hold = false,
      release,
      started,
      postCount = 0,
      failQuality = false;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    await page.route("**/api/admin/content-review?*", async (route) => {
      const url = new URL(route.request().url()),
        quality = url.searchParams.get("quality"),
        pageNumber = Number(url.searchParams.get("page"));
      if (route.request().method() !== "GET") {
        postCount++;
        return route.fulfill({ status: 500, json: { error: "No writes allowed" } });
      }
      if (failQuality && quality !== "all")
        return route.fulfill({ status: 503, json: { error: "Synthetic schema outage" } });
      if (hold && quality === "all" && pageNumber === 2) {
        started();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      const total = quality === "all" ? 1000 : quality === "expired" ? 78 : 35;
      return route.fulfill({
        json: {
          total,
          items: Array.from(
            { length: Math.min(25, Math.max(0, total - (pageNumber - 1) * 25)) },
            (_, i) => ({
              entity_id: `11111111-1111-4111-8111-${String((pageNumber - 1) * 25 + i + 1).padStart(12, "0")}`,
              entity_kind: "content",
              revision_key: "synthetic-revision",
              title: `Synthetic ${quality} ${(pageNumber - 1) * 25 + i + 1}`,
              publication_state: "draft",
              classification: "needs_review",
              quality_reason: quality === "all" ? undefined : quality,
              evidence: null,
            }),
          ),
        },
      });
    });
    await page.goto("http://127.0.0.1:56564/scripts/fixtures/cms-quality.html", {
      waitUntil: "networkidle",
    });
    await page.locator("summary").filter({ hasText: "內容來源審核佇列" }).focus();
    await page.keyboard.press("Enter");
    const quality = page.getByLabel("品質隊列");
    assert.equal(await quality.inputValue(), "expired");
    await page.getByText("Synthetic expired 1", { exact: false }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "選取本頁", exact: true }).count(), 0);
    await quality.selectOption("all");
    const all = page.getByRole("button", { name: /選取全部符合篩選的宣傳內容/ });
    await all.waitFor();
    hold = true;
    await all.click();
    await began;
    await quality.selectOption("demo");
    await page.getByText("Synthetic demo 1", { exact: false }).first().waitFor();
    await quality.selectOption("all");
    release();
    hold = false;
    await page
      .getByRole("status")
      .filter({ hasText: "正在固定選取範圍" })
      .waitFor({ state: "hidden" });
    const retained = await page.locator('input[type="checkbox"]:checked').count();
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-cms-quality-${process.env.CMS_QUALITY_BASELINE === "1" ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    await quality.selectOption("missing_source");
    await page.getByText("Synthetic missing_source 1", { exact: false }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "選取本頁", exact: true }).count(), 0);
    failQuality = true;
    await quality.selectOption("demo");
    await page.getByRole("alert").filter({ hasText: "未能載入" }).waitFor();
    await quality.selectOption("all");
    await page.getByText("Synthetic all 1", { exact: false }).first().waitFor();
    const axe = await new AxeBuilder({ page }).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    results.push({
      width,
      retainedAfterFilterCycle: retained,
      postCount,
      axe: axe.violations.map((v) => v.id),
      overflow,
      pageErrors: errors,
    });
    await context.close();
  }
  console.log(JSON.stringify(results));
  assert.ok(
    results.every(
      (r) =>
        r.retainedAfterFilterCycle === 0 &&
        r.postCount === 0 &&
        !r.overflow &&
        r.axe.length === 0 &&
        r.pageErrors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
