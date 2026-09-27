import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.EXPORT_TEST_ORIGIN ?? "http://127.0.0.1:56545";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback fixture required");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
const calls = [];
let supporterCalls = 0;
try {
  await page.route("**/api/admin/exports/*.csv?**", async (route) => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname, query: url.searchParams.toString(),
      auth: route.request().headers().authorization });
    if (url.pathname.endsWith("supporters.csv")) {
      supporterCalls++;
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (supporterCalls === 1)
        return route.fulfill({ status: 413, json: { total: 5001, limit: 5000 } });
      return route.fulfill({ status: 200, headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="supporters.csv"',
      }, body: "name\nAda\n" });
    }
    return route.fulfill({ status: 403, json: { error: "Private server detail" } });
  });
  await page.goto(origin + "/scripts/fixtures/export-bar.html", { waitUntil: "domcontentloaded" });
  const first = page.getByRole("button", { name: "支持者 CSV" });
  await first.waitFor();
  await first.click();
  await page.getByRole("status").getByText("匯出中").waitFor();
  assert.equal(await page.getByRole("button", { name: "捐款 CSV" }).isDisabled(), true);
  await page.getByRole("alert").getByText("5,001").waitFor();
  assert.equal(await page.getByRole("alert").getByText("縮小篩選").count(), 1);
  await page.screenshot({
    path: "docs/evidence/audit-remediation-20260927/ui/t14-export-413-after.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => {
    const button = document.querySelector('[role="alert"] button');
    button.click();
    button.click();
  });
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "supporters.csv");
  await page.getByRole("status").getByText("下載已開始").waitFor();
  assert.equal(supporterCalls, 2);
  assert.equal(calls[0].query, calls[1].query);
  assert.equal(new URLSearchParams(calls[1].query).get("q"), "Ada");
  assert.equal(calls[1].auth, "Bearer synthetic-local-token");

  await page.getByRole("button", { name: "捐款 CSV" }).click();
  await page.getByRole("alert").getByText("沒有權限").waitFor();
  assert.equal(calls.length, 3);
  await page.getByRole("textbox", { name: "搜尋" }).fill("Bob");
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  console.log("PASS T14 mobile 413/permission, pending guard, same-filter retry and complete CSV download");
} finally {
  await browser.close();
}
