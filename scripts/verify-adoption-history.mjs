import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const origin = process.env.CMS_HISTORY_TEST_ORIGIN ?? "http://127.0.0.1:56542";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback fixture required");
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/adoption-unsaved-data.json", import.meta.url), "utf8"),
);
const summary = ({ content: _content, ...rest }) => rest;
const older = {
  ...fixture.published,
  id: "33333333-3333-4333-8333-333333333333",
  revisionNumber: 3,
  state: "archived",
};
fixture.history = [summary(fixture.published)];
fixture.historyNextCursor = `1:${fixture.published.id}`;
let historyReads = 0;
let detailReads = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ json: { admin: { role: "staff", authUserId: "synthetic" } } }),
  );
  await page.route("**/api/admin/adoption-information?**", (route) =>
    route.fulfill({ json: { resource: "fees", items: [], total: 0, page: 1, pageSize: 50 } }),
  );
  await page.route("**/api/admin/adoption-instructions", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route("**/api/admin/adoption-instructions/history?**", (route) => {
    historyReads++;
    assert.equal(
      new URL(route.request().url()).searchParams.get("cursor"),
      fixture.historyNextCursor,
    );
    return route.fulfill({ json: { items: [summary(older)], nextCursor: null } });
  });
  await page.route("**/api/admin/adoption-instructions/revisions/*", (route) => {
    detailReads++;
    assert.ok(route.request().url().endsWith(older.id));
    return route.fulfill({ json: older });
  });
  await page.goto(origin + "/scripts/fixtures/adoption-unsaved.html");
  await page.getByRole("tab", { name: "頁面內容" }).click();
  await page.locator('[name="hero.title"]').fill("保留中的本機修改");
  assert.equal(detailReads, 0);
  const load = page.getByRole("button", { name: "查看更多版本" });
  await load.focus();
  await page.keyboard.press("Enter");
  const row = page.getByRole("listitem").filter({ hasText: "修訂 3" });
  await row.getByRole("button", { name: "查看內容" }).click();
  await page.getByRole("region", { name: "修訂 3 內容" }).waitFor();
  assert.equal(historyReads, 1);
  assert.equal(detailReads, 1);
  assert.equal(await page.locator('[name="hero.title"]').inputValue(), "保留中的本機修改");
  assert.equal(await page.getByRole("button", { name: "還原此版本" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "查看更多版本" }).count(), 0);
  await page.getByRole("link", { name: "離開領養管理" }).click();
  await page.getByRole("alertdialog").waitFor();
  console.log(
    JSON.stringify({
      viewport: "390x844",
      historyReads,
      detailReads,
      keyboardPaging: true,
      dirtyEditPreserved: true,
      exitGuard: true,
      staffRestoreHidden: true,
      synthetic: true,
    }),
  );
} finally {
  await browser.close();
}
