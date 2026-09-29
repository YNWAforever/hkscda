import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.FEE_TEST_ORIGIN ?? "http://127.0.0.1:56544";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback test origin required");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
page.on("console", (message) => { if (message.type() === "error") console.error("CONSOLE", message.text()); });
const rows = [
  { id: "11111111-1111-4111-8111-111111111111", animalType: "dog",
    itemName: "Dog A", priceHkd: "HK$100", sortOrder: 0, isPublished: true, version: 1 },
  { id: "22222222-2222-4222-8222-222222222222", animalType: "dog",
    itemName: "Dog B", priceHkd: "HK$200", sortOrder: 1, isPublished: true, version: 1 },
];
let failNext = true;
let reorderCalls = 0;
let contentCalls = 0;
try {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ json: { admin: { role: "staff", authUserId: "synthetic" } } }));
  await page.route("**/api/admin/adoption-information?**", (route) => {
    const resource = new URL(route.request().url()).searchParams.get("resource");
    const items = resource === "fees"
      ? [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((row) => ({ ...row }))
      : [];
    return route.fulfill({ json: { resource, items, total: items.length, page: 1, pageSize: 50 } });
  });
  await page.route("**/api/admin/adoption-information", async (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ status: 405, json: { error: "Synthetic POST only" } });
    const body = route.request().postDataJSON();
    if (body.resource !== "fee")
      return route.fulfill({ status: 400, json: { error: "Synthetic fee only" } });
    if (body.command === "reorder") {
      reorderCalls++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { error: "Synthetic swap failure" } });
      }
      const { firstId, secondId, expectedVersions } = body.input;
      const first = rows.find((row) => row.id === firstId);
      const second = rows.find((row) => row.id === secondId);
      if (!first || !second || first.version !== expectedVersions.first
        || second.version !== expectedVersions.second)
        return route.fulfill({ status: 409, json: { error: "Fee version or order conflict; reload the latest fees" } });
      [first.sortOrder, second.sortOrder] = [second.sortOrder, first.sortOrder];
      first.version += 2;
      second.version += 1;
      return route.fulfill({ json: { fees: [first, second] } });
    }
    if (body.command === "content") {
      contentCalls++;
      const { id, expectedVersion, itemName, priceHkd } = body.input;
      const row = rows.find((value) => value.id === id);
      if (!row || row.version !== expectedVersion)
        return route.fulfill({ status: 409, json: { error: "Fee version or order conflict; reload the latest fees" } });
      row.itemName = itemName;
      row.priceHkd = priceHkd;
      row.version++;
      return route.fulfill({ json: { fee: row } });
    }
    return route.fulfill({ status: 400, json: { error: "Unknown synthetic command" } });
  });
  await page.goto(origin + "/scripts/fixtures/adoption-unsaved.html", {
    waitUntil: "domcontentloaded", timeout: 45000,
  });
  const nameInputs = page.getByRole("textbox", { name: "費用項目" });
  await nameInputs.first().waitFor();
  assert.equal(await nameInputs.first().inputValue(), "Dog A");
  await page.getByRole("button", { name: "下移" }).first().click();
  await page.getByText("Synthetic swap failure").waitFor();
  assert.equal(reorderCalls, 1);
  assert.deepEqual(rows.map((row) => row.sortOrder), [0, 1]);
  assert.equal(await nameInputs.first().inputValue(), "Dog A");

  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="下移"]');
    button.click();
    button.click();
  });
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="費用項目"]');
    return input?.value === "Dog B";
  });
  assert.equal(reorderCalls, 2);
  assert.deepEqual(rows.map((row) => row.sortOrder), [1, 0]);

  await nameInputs.first().fill("Local B");
  rows[1].itemName = "Server B";
  rows[1].version++;
  await page.evaluate(() =>
    window.__cmsQueryClient.invalidateQueries({ queryKey: ["admin-adoption-information"] }));
  await page.getByRole("button", { name: "載入最新費用" }).waitFor();
  assert.equal(await nameInputs.first().inputValue(), "Local B");
  assert.equal(await page.getByRole("button", { name: "下移" }).first().isDisabled(), true);
  await page.getByRole("button", { name: "載入最新費用" }).click();
  assert.equal(await nameInputs.first().inputValue(), "Server B");

  await nameInputs.first().fill("Staff B");
  await page.getByRole("button", { name: "儲存" }).first().click();
  await page.waitForFunction(() =>
    document.querySelector('input[aria-label="費用項目"]')?.value === "Staff B");
  assert.equal(contentCalls, 1);
  assert.equal(rows[1].itemName, "Staff B");
  assert.equal(rows[1].sortOrder, 0);
  await page.screenshot({
    path: "docs/evidence/audit-remediation-20260927/ui/t13-fee-after.png",
    fullPage: true,
  });
  console.log("PASS T13 mobile failed swap rollback, double-click one request, canonical order, dirty conflict, content-only save");
} finally {
  await browser.close();
}
