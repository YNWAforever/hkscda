import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = process.env.COVERAGE_TEST_ORIGIN ?? "http://127.0.0.1:56548";
if (new URL(origin).hostname !== "127.0.0.1") throw Error("Loopback fixture required");
const browser = await chromium.launch({ headless: true });
const coverage = {
  state: "attention",
  from: "2026-09-30",
  to: "2026-10-13",
  centre: "all",
  scheduledSlots: 3,
  publishedSlots: 1,
  unpublishedSlots: 1,
  missingSlots: 1,
  offDays: 11,
  inapplicableDays: 0,
  nextApprovedAt: null,
  blockers: [
    { date: "2026-10-05", templateKey: "synthetic", policyName: "合成義工政策", reason: "missing" },
  ],
};
try {
  for (const mode of ["public", "admin"])
    for (const width of [390, 768, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/admin/volunteers/**", async (route) => {
        const url = new URL(route.request().url());
        assert.equal(route.request().headers().authorization, "Bearer synthetic-local-token");
        await route.fulfill({
          json: url.pathname.endsWith("overview")
            ? {
                date: "2026-09-30",
                counts: { pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 },
                coverage: {
                  centres: ["cat"],
                  next14: coverage,
                  next30: { ...coverage, to: "2026-10-29" },
                },
              }
            : { activities: [] },
        });
      });
      await page.goto(origin + "/scripts/fixtures/volunteer-coverage.html?mode=" + mode, {
        waitUntil: "networkidle",
      });
      await page
        .getByText(mode === "public" ? "目前沒有已發布的服務場次" : "未來 14／30 日服務覆蓋", {
          exact: false,
        })
        .first()
        .waitFor();
      const measure = () =>
        page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      let size = await measure();
      assert.ok(size.scroll <= size.width + 1);
      await page.screenshot({
        path:
          "docs/evidence/audit-remediation-20260927/ui/t16-" +
          mode +
          "-sequential-" +
          width +
          ".png",
        fullPage: true,
      });
      if (width === 768) {
        await page.evaluate(() => (document.body.style.zoom = "200%"));
        size = await measure();
        assert.ok(size.scroll <= size.width + 1);
        await page.screenshot({
          path:
            "docs/evidence/audit-remediation-20260927/ui/t16-" +
            mode +
            "-sequential-768-zoom200.png",
          fullPage: true,
        });
      }
      if (mode === "public" && width === 390) {
        const search = page.getByRole("searchbox");
        await search.focus();
        await page.keyboard.type("cat");
        await page.getByText("沒有符合篩選條件的場次", { exact: true }).waitFor();
        await page.getByRole("button", { name: "清除篩選", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByText("目前沒有已發布的服務場次", { exact: true }).waitFor();
        assert.equal(await search.inputValue(), "");
        await page.getByRole("button", { name: "重新查看場次" }).click();
        await page.getByLabel("Synthetic retries").getByText("1").waitFor();
        assert.equal(
          await page.getByRole("link", { name: "聯絡義工團隊" }).getAttribute("href"),
          "mailto:info@hkscda.com",
        );
      }
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ mode, width, noOverflow: true, errors: 0 }));
      await page.close();
    }
} finally {
  await browser.close();
}
