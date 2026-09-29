import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const baseline = process.env.PORTAL_FIXTURE_BASELINE === "1";
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let preference;
    let receipt;
    let navigated = false;
    await page.route("**/api/supporter/records", (route) => {
      const owner = route.request().headers().authorization?.endsWith("synthetic-b") ? "B" : "A";
      return route.fulfill({
        json: {
          adoption: [],
          sponsorship: [],
          donations: [],
          receipts: [
            {
              id: "receipt-" + owner,
              receiptNo: "SYNTHETIC-" + owner,
              issuedAt: "2026-09-01",
              totalAmountCents: 10000,
              downloadable: true,
            },
          ],
          marketingEmail: "opt_out",
        },
      });
    });
    await page.route("**/api/supporter/preferences", (route) => {
      preference = route;
    });
    await page.route("**/api/supporter/receipts/*", (route) => {
      receipt = route;
    });
    await page.route("**/receipt-trap", (route) => {
      navigated = true;
      return route.fulfill({ body: "Unexpected stale receipt navigation" });
    });
    await page.goto("http://127.0.0.1:56556/scripts/fixtures/supporter-portal.html", {
      waitUntil: "networkidle",
    });
    await page.getByText("收條 SYNTHETIC-A", { exact: false }).waitFor();
    await page.getByRole("button", { name: "同意接收推廣電郵", exact: true }).click();
    while (!preference) await page.waitForTimeout(20);
    await page.getByRole("button", { name: "切換用戶 B" }).click();
    await page.getByText("收條 SYNTHETIC-B", { exact: false }).waitFor();
    const preferenceUnlocked = await page
      .getByRole("button", { name: "同意接收推廣電郵", exact: true })
      .isEnabled();
    const noPreviousRecords = !(await page.locator("body").innerText()).includes("SYNTHETIC-A");
    await preference.fulfill({ json: { status: "opt_in", changed: true } });
    await page.waitForTimeout(100);
    assert.ok((await page.locator("body").innerText()).includes("已退出"));
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t22-portal-${baseline ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      axe.violations.map((v) => v.id),
      [],
    );
    if (width === 768) {
      await page.evaluate(() => (document.body.style.zoom = "200%"));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.getByRole("button", { name: "下載收條", exact: true }).click();
    while (!receipt) await page.waitForTimeout(20);
    await page.getByRole("button", { name: "卸載入口" }).click();
    await receipt.fulfill({ json: { url: "http://127.0.0.1:56556/receipt-trap" } });
    await page.waitForTimeout(200);
    results.push({
      width,
      preferenceUnlocked,
      noPreviousRecords,
      unmountedReceiptBlocked: !navigated,
      noPageErrors: errors.length === 0,
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(
    results.every(
      (r) =>
        r.preferenceUnlocked && r.noPreviousRecords && r.unmountedReceiptBlocked && r.noPageErrors,
    ),
    "Portal must fence every request after identity change or unmount",
  );
} finally {
  await browser.close();
}
