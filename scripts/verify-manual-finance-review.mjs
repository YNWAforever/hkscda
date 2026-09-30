import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const baseline = process.env.MANUAL_FINANCE_BASELINE === "1";
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let credits = 0,
      attempts = 0,
      retries = 0;
    await page.route("**/api/admin/payments/*/reconcile", async (route) => {
      attempts++;
      if (attempts === 1) {
        credits++;
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic lost response after commit" },
        });
      }
      if (baseline)
        return route.fulfill({
          status: 409,
          json: { error: "Payment is not pending and cannot be reconciled" },
        });
      return route.fulfill({
        json: {
          kind: "duplicate",
          donationId: "donation-synthetic",
          deliveryJobId: "22222222-2222-4222-8222-222222222222",
          deliveryStatus: "pending",
        },
      });
    });
    await page.route("**/api/admin/donations/delivery/*/retry", (route) => {
      retries++;
      return route.fulfill({ json: { deliveryStatus: retries === 1 ? "retryable" : "complete" } });
    });
    await page.goto("http://127.0.0.1:56563/scripts/fixtures/manual-finance.html", {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "標記已收款", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox").fill("SYNTHETIC-FPS-001");
    await page.getByRole("button", { name: "確認收款", exact: true }).click();
    await page.getByText("Synthetic lost response after commit").waitFor();
    await page.getByRole("button", { name: "確認收款", exact: true }).click();
    if (baseline) await page.getByText("Payment is not pending and cannot be reconciled").waitFor();
    else await page.getByRole("alert").filter({ hasText: "收款及稽核已記錄" }).waitFor();
    const recovery =
      (await page.getByRole("button", { name: "重試收條及電郵", exact: true }).count()) === 1;
    const axe = await new AxeBuilder({ page }).analyze();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-manual-finance-${baseline ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    if (recovery) {
      assert.equal(
        await page.getByRole("button", { name: "確認收款", exact: true }).isDisabled(),
        true,
      );
      const retry = page.getByRole("button", { name: "重試收條及電郵", exact: true });
      await retry.click();
      await retry.waitFor({ state: "visible" });
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent.includes("重試收條及電郵") && !b.disabled,
        ),
      );
      await retry.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("status").filter({ hasText: "已更新 1 次" }).waitFor();
    }
    results.push({
      width,
      recovery,
      credits,
      attempts,
      retries,
      axe: axe.violations.map((v) => v.id),
      overflow,
      pageErrors: errors,
    });
    await context.close();
  }
  console.log(
    JSON.stringify({
      environment:
        "actual dialog; synthetic API responses reflect separately tested SQL/service outcomes",
      results,
    }),
  );
  assert.ok(
    results.every(
      (r) =>
        r.recovery &&
        r.credits === 1 &&
        r.retries === 2 &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.pageErrors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
