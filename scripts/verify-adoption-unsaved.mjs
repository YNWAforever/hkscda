import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const instructionPage = JSON.parse(
  readFileSync(new URL("./fixtures/adoption-unsaved-data.json", import.meta.url), "utf8"),
);
const origin = process.env.CMS_UNSAVED_TEST_ORIGIN ?? "http://127.0.0.1:56541";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback test origin required");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
let serverPage = structuredClone(instructionPage);
let saveMode = "success";
let saveCount = 0;
try {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ json: { admin: { role: "staff", authUserId: "synthetic" } } }),
  );
  await page.route("**/api/admin/adoption-information?**", (route) =>
    route.fulfill({ json: { resource: "fees", items: [], total: 0, page: 1, pageSize: 50 } }),
  );
  await page.route("**/api/admin/adoption-instructions", (route) =>
    route.fulfill({ json: serverPage }),
  );
  await page.route("**/api/admin/adoption-instructions/draft", async (route) => {
    saveCount++;
    if (saveMode === "failure")
      return route.fulfill({ status: 503, json: { error: { message: "Synthetic save failure" } } });
    if (saveMode === "conflict") {
      serverPage.draft = {
        ...serverPage.draft,
        version: 5,
        content: {
          ...serverPage.draft.content,
          hero: { ...serverPage.draft.content.hero, title: "其他職員修改" },
        },
      };
      return route.fulfill({
        status: 409,
        json: { error: { message: "Version conflict", code: "version_conflict" } },
      });
    }
    const input = route.request().postDataJSON();
    serverPage.draft = {
      ...serverPage.draft,
      version: serverPage.draft.version + 1,
      content: input.content,
    };
    return route.fulfill({ json: serverPage.draft });
  });
  await page.goto(origin + "/scripts/fixtures/adoption-unsaved.html", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.getByRole("tab", { name: "頁面內容" }).click();
  const title = page.locator('textarea[name="hero.title"]');
  await title.fill("合成測試修改");
  const beforeUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return { allowed: window.dispatchEvent(event), prevented: event.defaultPrevented };
  });
  assert.equal(beforeUnload.prevented, true);
  serverPage.draft = {
    ...serverPage.draft,
    version: serverPage.draft.version + 1,
    content: {
      ...serverPage.draft.content,
      hero: { ...serverPage.draft.content.hero, title: "背景更新" },
    },
  };
  await page.evaluate(() =>
    window.__cmsQueryClient.invalidateQueries({ queryKey: ["admin-adoption-instructions"] }),
  );
  assert.equal(await title.inputValue(), "合成測試修改");
  await page.getByRole("tab", { name: "領養費用" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  assert.equal(await title.inputValue(), "合成測試修改");
  await dialog.getByRole("button", { name: "取消" }).click();
  assert.equal(await title.inputValue(), "合成測試修改");
  saveMode = "failure";
  await page.getByRole("tab", { name: "領養費用" }).click();
  await dialog.getByRole("button", { name: "儲存並離開" }).click();
  assert.equal(await title.inputValue(), "合成測試修改");
  assert.equal(await dialog.isVisible(), true);
  await dialog.getByRole("button", { name: "取消" }).click();
  saveMode = "success";
  await page.getByRole("tab", { name: "領養費用" }).click();
  await dialog.getByRole("button", { name: "儲存並離開" }).click();
  await page.getByRole("tab", { name: "頁面內容" }).click();
  assert.equal(await page.locator('textarea[name="hero.title"]').inputValue(), "合成測試修改");
  assert.equal(saveCount, 2);
  await page.locator('textarea[name="hero.title"]').fill("路由測試修改");
  await page.getByRole("link", { name: "離開領養管理" }).click();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('textarea[name="hero.title"]').inputValue(), "路由測試修改");
  await page.getByRole("link", { name: "離開領養管理" }).click();
  await dialog.waitFor();
  saveMode = "conflict";
  await dialog.getByRole("button", { name: "儲存並離開" }).click();
  assert.equal(await dialog.isVisible(), true);
  await dialog.getByRole("button", { name: "取消" }).click();
  assert.equal(await page.locator('textarea[name="hero.title"]').inputValue(), "路由測試修改");
  await page.getByText("比較本機與伺服器文字").click();
  assert.equal(await page.getByText("伺服器：其他職員修改").isVisible(), true);
  await page.getByRole("button", { name: "採用伺服器版本（放棄本機修改）" }).click();
  await page.waitForFunction(
    () => document.querySelector('textarea[name="hero.title"]')?.value === "其他職員修改",
  );
  await page.locator('textarea[name="hero.title"]').fill("會捨棄的修改");
  await page.getByRole("tab", { name: "領養費用" }).click();
  await dialog.getByRole("button", { name: "捨棄並離開" }).click();
  await page.getByRole("tab", { name: "頁面內容" }).click();
  assert.equal(await page.locator('textarea[name="hero.title"]').inputValue(), "其他職員修改");
  await page.locator('textarea[name="hero.title"]').fill("路由捨棄");
  await page.getByRole("link", { name: "離開領養管理" }).click();
  await dialog.getByRole("button", { name: "捨棄並離開" }).click();
  await page.getByText("已離開領養管理").waitFor();
  assert.equal(saveCount, 3);
  console.log(
    "PASS T10 tab/route cancel, failed save, successful save, 409 compare, discard latest, keyboard escape",
  );
} finally {
  await browser.close();
}
