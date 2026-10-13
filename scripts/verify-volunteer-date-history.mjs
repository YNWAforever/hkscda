import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const origin = "http://127.0.0.1:56548";
const browser = await chromium.launch({ headless: true });
const results = [];
let activePage;
let expectedSearch;
try {
  for (const index of [0, 1, 2]) {
    const context = await browser.newContext({ storageState: sessions[index].path });
    const page = await context.newPage();
    activePage = page;
    await page.clock.setFixedTime(new Date("2024-02-28T15:59:59Z"));
    const bodies = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.replace(/\/$/, "") === "/api/admin/volunteers/bulk" &&
        request.method() === "POST"
      )
        bodies.push(request.postDataJSON());
    });
    const expectSearch = async (expected) => {
      expectedSearch = expected;
      await page.waitForFunction(
        (values) =>
          Object.entries(values).every(
            ([key, value]) => new URLSearchParams(location.search).get(key) === value,
          ),
        expected,
      );
      const dates = page.locator('#volunteer-page-content input[type="date"]');
      if ("from" in expected) assert.equal(await dates.nth(0).inputValue(), expected.from);
      if ("until" in expected) assert.equal(await dates.nth(1).inputValue(), expected.until);
    };
    await page.goto(origin + "/admin/volunteers/activities");
    await expectSearch({ date_scope: "future", from: "2024-02-28", until: "2024-03-29" });
    await page.clock.setFixedTime(new Date("2024-02-28T16:00:00Z"));
    await page.getByRole("button", { name: "今天起30天", exact: true }).click();
    await expectSearch({ date_scope: "future", from: "2024-02-29", until: "2024-03-30" });
    await page.getByRole("button", { name: "所有日期", exact: true }).click();
    await expectSearch({ date_scope: "all" });
    assert.equal(new URL(page.url()).searchParams.has("from"), false);
    await page.getByRole("button", { name: "歷史活動", exact: true }).click();
    await expectSearch({ date_scope: "history", until: "2024-02-28" });
    await page.goBack();
    await expectSearch({ date_scope: "all" });
    await page.goForward();
    await expectSearch({ date_scope: "history", until: "2024-02-28" });
    await page.reload();
    await expectSearch({ date_scope: "history", until: "2024-02-28" });
    await page.goto(
      origin +
        "/admin/volunteers/activities?date_scope=custom&from=2024-02-29&until=2024-03-01&page=2",
    );
    await expectSearch({
      date_scope: "custom",
      from: "2024-02-29",
      until: "2024-03-01",
      page: "2",
    });
    await page.reload();
    await expectSearch({
      date_scope: "custom",
      from: "2024-02-29",
      until: "2024-03-01",
      page: "2",
    });
    await page.goto(
      origin + "/admin/volunteers/activities?date_scope=custom&from=2024-02-30&page=0",
    );
    await expectSearch({
      date_scope: "future",
      from: "2024-02-29",
      until: "2024-03-30",
      page: "1",
    });
    assert.ok(bodies.some((body) => body.action === "list"));
    for (const body of bodies.filter((body) => body.action === "list")) {
      assert.equal(Object.hasOwn(body.filter, "date_scope"), false);
      assert.equal(body.filter.q ?? "", "");
    }
    results.push({
      role: sessions[index].role,
      check: "UC49-date-history",
      injectedBrowserClockOnly: true,
      hkMidnightLeapDay: true,
      allHistoryBackForward: true,
      historyCustomReload: true,
      invalidDateRecovery: true,
      apiExcludesUiFields: true,
    });
    await context.close();
  }
} catch (error) {
  results.push({
    check: "UC49-date-history",
    status: "failed",
    error: error.message,
    expectedSearch,
    actualSearch: activePage ? new URL(activePage.url()).search : null,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    process.env.DATE_HISTORY_OUTPUT ??
      ".superpowers/sdd/volunteer-admin-20261013/date-history-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
