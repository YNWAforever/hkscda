import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.EXPORT_TEST_ORIGIN ?? "http://127.0.0.1:56541";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback fixture required");
const jobId = "78048e8d-f3a8-4d3d-8817-0e905be74cd0";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
page.setDefaultTimeout(30000);
let created = false;
let cancelled = false;
let revoked = false;
let statusReads = 0;
let snapshot = "";
try {
  await page.route("**/api/admin/exports/supporters.csv?**", (route) =>
    route.fulfill({ status: 413, json: { total: 5001, limit: 5000 } }),
  );
  await page.route("**/api/admin/exports/jobs", async (route) => {
    const request = route.request();
    assert.equal(request.headers().authorization, "Bearer synthetic-local-token");
    assert.equal(request.method(), "POST");
    const body = JSON.parse(request.postData() ?? "{}");
    assert.equal(body.kind, "supporters");
    assert.equal(body.filters.q, "Ada");
    assert.equal(body.filters.role, "donor");
    snapshot = JSON.stringify(body.filters);
    created = true;
    await route.fulfill({
      status: 201,
      json: {
        id: jobId,
        kind: "supporters",
        total: 5001,
        status: "pending",
      },
    });
  });
  await page.route("**/api/admin/exports/jobs/" + jobId + "/download", async (route) => {
    assert.equal(route.request().headers().authorization, "Bearer synthetic-local-token");
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="supporters.csv"',
      },
      body: "name\nSynthetic\n",
    });
  });
  await page.route("**/api/admin/exports/jobs/" + jobId, async (route) => {
    assert.equal(route.request().headers().authorization, "Bearer synthetic-local-token");
    if (route.request().method() === "DELETE") {
      cancelled = true;
      return route.fulfill({ status: 200, json: { status: "cancelled" } });
    }
    if (revoked) return route.fulfill({ status: 403, json: { error: "forbidden" } });
    statusReads += 1;
    await route.fulfill({
      status: 200,
      json: {
        id: jobId,
        kind: "supporters",
        total: 5001,
        status: statusReads === 1 ? "processing" : "ready",
        processed: statusReads === 1 ? 500 : 5001,
      },
    });
  });
  await page.goto(origin + "/scripts/fixtures/export-bar.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "支持者 CSV" }).click();
  await page.getByRole("button", { name: "建立背景匯出" }).click();
  await page.getByText("背景匯出：0/5001 筆").waitFor();
  assert.equal(created, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("背景匯出：0/5001 筆").waitFor();
  await page.getByRole("button", { name: "下載完整 CSV" }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載完整 CSV" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "supporters.csv");
  await page.screenshot({
    path: "docs/evidence/audit-remediation-20260927/ui/t14-background-export-ready.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "取消" }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("背景匯出："));
  assert.equal(cancelled, true);
  assert.equal(statusReads >= 2, true);
  assert.equal(JSON.parse(snapshot).q, "Ada");
  revoked = true;
  await page.getByRole("button", { name: "支持者 CSV" }).click();
  await page.getByRole("button", { name: "建立背景匯出" }).click();
  await page.getByRole("alert").getByText("沒有權限").waitFor();
  assert.equal(await page.getByRole("button", { name: "下載完整 CSV" }).count(), 0);
  console.log(
    "PASS T14 synthetic mobile create, resume, progress, download, cancel and role revocation",
  );
} finally {
  await browser.close();
}
