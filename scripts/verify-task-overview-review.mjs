import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let requests = 0;
    await page.route("**/api/admin/me", (route) =>
      route.fulfill({
        json: {
          admin: {
            id: "admin",
            authUserId: "admin",
            email: "admin@example.invalid",
            role: "admin",
            status: "active",
          },
        },
      }),
    );
    await page.route("**/api/admin/task-overview", (route) => {
      requests++;
      const staff = route.request().headers().authorization === "Bearer staff";
      return route.fulfill({
        json: {
          cards: [
            {
              key: staff ? "adoption_unassigned" : "content_drafts",
              label: staff ? "職員領養待辦" : "管理員內容待辦",
              href: staff ? "/admin/coordinator/inbox" : "/admin/content",
              metric: { state: "ready", count: 0, oldestAt: null },
            },
            {
              key: staff ? "volunteer_pending" : "media_failed",
              label: staff ? "義工登記" : "媒體失敗",
              href: "/admin/volunteers",
              metric: { state: "unavailable" },
            },
          ],
        },
      });
    });
    await page.goto("http://127.0.0.1:56557/scripts/fixtures/task-overview.html", {
      waitUntil: "networkidle",
    });
    await page.getByRole("heading", { name: "管理員內容待辦" }).waitFor();
    await page.getByRole("button", { name: "切換職員" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const text = await page.locator("main").innerText();
    const roleChanged = text.includes("職員領養待辦") && !text.includes("管理員內容待辦");
    const zeroAndUnavailable = text.includes("0") && text.includes("未能讀取");
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-overview-${process.env.TASK_FIXTURE_BASELINE === "1" ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page }).analyze();
    if (width === 768) await page.evaluate(() => (document.body.style.zoom = "200%"));
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    );
    const beforeSuspension = requests;
    await page.getByRole("button", { name: "停權", exact: true }).click();
    await page.waitForTimeout(100);
    const suspendedHidden = (await page.getByRole("link", { name: "開啟工作區" }).count()) === 0;
    results.push({
      width,
      roleChanged,
      zeroAndUnavailable,
      suspendedHidden,
      noSuspendedRequest: requests === beforeSuspension,
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
        r.roleChanged &&
        r.zeroAndUnavailable &&
        r.suspendedHidden &&
        r.noSuspendedRequest &&
        r.noOverflow &&
        r.axeViolations.length === 0 &&
        r.pageErrors.length === 0,
    ),
    "Task overview must follow current identity and hide suspended counts",
  );
} finally {
  await browser.close();
}
