import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = "http://127.0.0.1:56551";
const baseline = process.argv.includes("--baseline");
const browser = await chromium.launch();
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [],
      calls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let release;
    await page.route("**/api/admin/media-repairs", async (route) => {
      if (route.request().method() === "POST") {
        calls.push(route.request().postDataJSON());
        await new Promise((resolve) => {
          release = resolve;
        });
        await route.fulfill({ status: 409, json: { error: "Repair state changed; reload" } });
      } else
        await route.fulfill({
          json: {
            pending: 0,
            claimed: 0,
            failed: 2,
            oldestAgeSeconds: 3600,
            items: [0, 1].map((i) => ({
              kind: "animal",
              itemId: "synthetic-" + i,
              entityId: "synthetic-cat-" + i,
              status: "failed",
              attempts: 8,
              nextRetryAt: null,
              lastErrorCode: "copy_failed",
              createdAt: "2026-09-27T01:00:00Z",
            })),
          },
        });
    });
    await page.goto(origin + "/scripts/fixtures/media-repair.html", { waitUntil: "networkidle" });
    const review = page.getByRole("button", { name: "覆核並重試", exact: true });
    await review.first().click();
    await page.getByRole("textbox").fill("Synthetic cause repaired and checksum verified");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "記錄理由並重試", exact: true }).click();
    await page.getByRole("button", { name: "提交中…", exact: true }).waitFor();
    assert.equal(
      await review.nth(1).isDisabled(),
      !baseline,
      "Cannot change reviewed item while retry is pending",
    );
    assert.equal(await page.getByRole("textbox").isDisabled(), !baseline);
    assert.equal(await page.getByRole("checkbox").isDisabled(), !baseline);
    release();
    await page.getByRole("alert").waitFor();
    await review.nth(1).click();
    assert.equal(
      await page.getByRole("alert").count(),
      baseline ? 1 : 0,
      "Old item's error must not label the newly selected item",
    );
    assert.equal(await page.getByRole("textbox").inputValue(), "");
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].itemId, "synthetic-0");
    assert.equal(calls[0].causeCorrected, true);
    const dimensions = () =>
      page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    let m = await dimensions();
    assert.ok(m.scroll <= m.viewport + 1);
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t19-media-repair-${baseline ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    if (width === 768) {
      await page.evaluate(() => (document.body.style.zoom = "200%"));
      m = await dimensions();
      assert.ok(m.scroll <= m.viewport + 1);
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        width,
        requests: calls.length,
        pendingSelectionLocked: !baseline,
        errorReset: !baseline,
        noOverflow: true,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
