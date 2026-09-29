import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch();
const results = [];
const operationId = "33333333-3333-4333-8333-333333333333";
const ids = (n) =>
  Array.from({ length: n }, (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`);
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let firstRead = true,
      firstApply = true;
    let writes = 0;
    const make = (selected) => ({
      operationId,
      reviewerUserId: "22222222-2222-4222-8222-222222222222",
      filterHash: "a".repeat(64),
      createdAt: "2026-09-27T00:00:00Z",
      expiresAt: "2099-09-28T00:00:00Z",
      state: "queued",
      items: selected.map((entityId) => ({
        entityId,
        status: "pending",
        reasonCode: null,
        beforeReviewer: null,
        afterReviewer: "22222222-2222-4222-8222-222222222222",
        expectedProfileRevision: 1,
        expectedAssignmentVersion: 0,
      })),
    });
    let operation = make(ids(25));
    let holdRead = false;
    let releaseRead;
    let readStarted;

    await page.route("**/api/admin/access/users", (route) =>
      route.fulfill({
        json: {
          users: [
            {
              authUserId: "22222222-2222-4222-8222-222222222222",
              email: "reviewer@example.invalid",
              role: "staff",
              status: "active",
            },
          ],
        },
      }),
    );
    await page.route("**/api/admin/volunteers/reviewer-bulk*", async (route) => {
      if (route.request().method() === "GET") {
        if (holdRead) {
          readStarted();
          await new Promise((resolve) => {
            releaseRead = resolve;
          });
          return route.fulfill({ json: operation });
        }
        if (firstRead) {
          firstRead = false;
          return route.fulfill({ status: 503, json: { error: "Synthetic temporary outage" } });
        }
        return route.fulfill({ json: operation });
      }
      const body = route.request().postDataJSON();
      if (body.action === "preview") {
        operation = make(body.ids);
        operation.operationId = crypto.randomUUID();
        return route.fulfill({ json: operation });
      }
      const selected = operation.items
        .filter((item) => item.status === "pending")
        .slice(0, firstApply ? 10 : 25);
      for (const item of selected) {
        item.status = "succeeded";
        writes++;
      }
      operation.state = operation.items.some((item) => item.status === "pending")
        ? "partial"
        : "done";
      if (firstApply) {
        firstApply = false;
        return route.fulfill({ status: 503, json: { error: "Synthetic interrupted response" } });
      }
      return route.fulfill({ json: operation });
    });
    await page.goto("http://127.0.0.1:56559/scripts/fixtures/volunteer-review-bulk.html", {
      waitUntil: "networkidle",
    });
    await page.evaluate(
      (id) => sessionStorage.setItem("volunteer-review-bulk-operation", id),
      operationId,
    );
    await page.reload({ waitUntil: "networkidle" });
    const recoveryPreserved = await page.evaluate(
      (id) => sessionStorage.getItem("volunteer-review-bulk-operation") === id,
      operationId,
    );
    const retry = page.getByRole("button", { name: "重新讀取結果", exact: true });
    const recoveryRetry = (await retry.count()) === 1;
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-volunteer-review-bulk-${process.env.BULK_FIXTURE_BASELINE === "1" ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    if (recoveryRetry) await retry.click();
    else {
      await page
        .getByRole("combobox", { name: "審核者", exact: true })
        .selectOption("22222222-2222-4222-8222-222222222222");
      await page.getByRole("button", { name: "建立分派預覽", exact: true }).click();
    }
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "套用待處理項目", exact: true }).click();
    await page.getByText(/待處理 15 · 成功 10/).waitFor();
    await page.getByRole("button", { name: "套用待處理項目", exact: true }).click();
    await page.getByText(/待處理 0 · 成功 25/).waitFor();
    assert.equal(writes, 25);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "下載逐筆結果 CSV" }).click();
    assert.equal((await download).suggestedFilename(), "bulk-results.csv");
    await page.getByRole("button", { name: "選取 1000 筆" }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("combobox", { name: "審核者", exact: true })
      .selectOption("22222222-2222-4222-8222-222222222222");
    await page.getByRole("button", { name: "建立分派預覽", exact: true }).click();
    await page.getByText("1 / 40", { exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 25);
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    const axe = await new AxeBuilder({ page }).analyze();
    if (width === 768) await page.evaluate(() => (document.body.style.zoom = "200%"));
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    );
    holdRead = true;
    const pendingRecovery = new Promise((resolve) => {
      readStarted = resolve;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await pendingRecovery;
    const recoveryBlocksPreview = await page
      .getByRole("combobox", { name: "審核者", exact: true })
      .isDisabled();
    releaseRead();
    await page.getByText("1 / 40", { exact: true }).waitFor();
    results.push({
      recoveryBlocksPreview,
      width,
      recoveryPreserved,
      recoveryRetry,
      partialRetryWrites: writes,
      preview1000PageRows: 25,
      noOverflow,
      axeViolations: axe.violations.map((v) => v.id),
      pageErrors: errors,
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(
    results.every(
      (r) =>
        r.recoveryBlocksPreview &&
        r.recoveryPreserved &&
        r.recoveryRetry &&
        r.partialRetryWrites === 25 &&
        r.noOverflow &&
        r.axeViolations.length === 0 &&
        r.pageErrors.length === 0,
    ),
    "Transient read errors must retain and reload the durable bulk operation",
  );
} finally {
  await browser.close();
}
