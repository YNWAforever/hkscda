import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before = process.argv.includes("--before"),
  browser = await chromium.launch(),
  results = [];
try {
  for (const width of [390, 768, 1366])
    for (const mode of before ? ["lost"] : ["lost", "read-failed"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      let reads = 0,
        posts = 0,
        committed = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      await context.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== "127.0.0.1") return route.abort();
        if (!u.pathname.startsWith("/api/")) return route.continue();
        if (u.pathname.endsWith("/retry")) {
          assert.equal(route.request().method(), "POST");
          posts++;
          committed = true;
          return route.abort("failed");
        }
        if (u.pathname === "/api/admin/finance/delivery-jobs") {
          assert.equal(route.request().method(), "GET");
          reads++;
          if (committed && mode === "read-failed")
            return route.fulfill({ status: 503, json: { error: "Synthetic read unavailable" } });
          return route.fulfill({
            json: {
              jobs: committed
                ? []
                : [
                    {
                      id: "11111111-2222-4333-8444-555555555555",
                      paymentId: "22222222-3333-4444-8555-666666666666",
                      status: "retryable",
                      attempts: 2,
                      errorCode: "provider_error",
                      createdAt: "2026-09-28T00:00:00Z",
                      nextAttemptAt: null,
                      paymentStatus: "succeeded",
                      donationStatus: "succeeded",
                    },
                  ],
              total: committed ? 0 : 1,
              page: 1,
              pageSize: 25,
            },
          });
        }
        return route.fulfill({ status: 404, json: { error: "Unexpected fixture request" } });
      });
      await page.goto("http://127.0.0.1:56571/scripts/fixtures/delivery-worklist.html", {
        waitUntil: "networkidle",
      });
      const retry = page.getByRole("button", { name: "重試此工作", exact: true });
      await retry.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("alert").first().waitFor();
      await page.waitForLoadState("networkidle");
      const rows = await page.locator("tbody tr").count(),
        disabled = mode === "read-failed" ? await retry.isDisabled() : null,
        axe = await new AxeBuilder({ page }).analyze(),
        overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (mode === "lost")
        await page.screenshot({
          path: `docs/evidence/audit-remediation-20260927/ui/t23-delivery-${before ? "before" : "after"}-${width}.png`,
          fullPage: true,
        });
      results.push({
        width,
        mode,
        reads,
        posts,
        rows,
        disabled,
        axe: axe.violations.map((v) => v.id),
        overflow,
        errors,
      });
      await context.close();
    }
  console.log(JSON.stringify(results));
  assert.ok(
    results.every(
      (r) =>
        r.reads === 2 &&
        r.posts === 1 &&
        (r.mode === "lost" ? r.rows === 0 : r.disabled) &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
