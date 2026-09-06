import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const out = "docs/evidence/legacy-import-20260906/profile-browser";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const errors = [];
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 768 ? 1024 : 900 } });
    page.on("pageerror", (e) => errors.push(e.message));
    for (const species of ["cat", "dog"]) {
      await page.goto(`http://127.0.0.1:4173/animals/${species}`);
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(
        (n) => document.querySelectorAll("article.public-animal-card").length === n,
        6,
      );
      assert.equal(await page.locator("article.public-animal-card").count(), 6);
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator(".public-animal-fallback").count(), 2);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        bodyScroll: document.body.scrollWidth,
        menuRight: document.querySelector(".menu-trigger").getBoundingClientRect().right,
        columns: getComputedStyle(document.querySelector(".animal-profile-grid"))
          .gridTemplateColumns,
      }));
      assert.ok(layout.scroll <= layout.width);
      assert.ok(layout.bodyScroll <= layout.width);
      if (width === 390) assert.ok(layout.menuRight <= layout.width);
      assert.equal(layout.columns.split(" ").length, width === 390 ? 1 : width === 768 ? 2 : 3);
      await page.screenshot({ path: `${out}/${species}-${width}.png`, fullPage: true });
      findings.push({ species, width, layout, cards: 6, noPhoto: 2, h1: 1 });
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/animals/cat");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("名字或編號", { exact: true }).fill("c01");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await page.waitForURL(/q=c01/);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    1,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 1);
  await page.getByRole("button", { name: "清除全部", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    6,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 6);
  await page.goBack();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByLabel("名字或編號", { exact: true }).inputValue(), "c01");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    1,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 1);
  await page.goto("http://127.0.0.1:4173/animals/cat");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: /^絕育記錄/ }).selectOption("unknown");
  await page.waitForURL(/neutered=unknown/);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    2,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 2);
  await page.getByRole("combobox", { name: /^領養經驗/ }).selectOption("newbie");
  await page.waitForURL(/suitability=newbie/);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    0,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 0);
  await page.getByRole("button", { name: "清除篩選", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (n) => document.querySelectorAll("article.public-animal-card").length === n,
    6,
  );
  assert.equal(await page.locator("article.public-animal-card").count(), 6);
  findings.push({
    filters:
      "name/code case-insensitive search, clear, browser back, unknown neutering, suitability intersection and empty recovery passed",
  });
  for (const [url, label] of [
    ["/animals/cat", "加入領養清單"],
    ["/sponsors", "加入助養清單"],
  ]) {
    await page.goto("http://127.0.0.1:4173" + url);
    await page.waitForLoadState("networkidle");
    const card = page.locator("article.public-animal-card").first();
    await card.getByRole("button", { name: label, exact: true }).click();
    assert.equal(
      await card.getByRole("button", { name: "已加入，按此移除", exact: true }).count(),
      1,
    );
    await card.locator("a").first().click();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "已加入，按此移除", exact: true }).count(),
      1,
    );
    await page.screenshot({
      path: `${out}/${url.includes("cat") ? "adoption" : "sponsorship"}-detail.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "已加入，按此移除", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1);
    findings.push({
      intent: label,
      detail: page.url(),
      shortlist: "add persists into detail; remove passed",
    });
  }
  await page.goto("http://127.0.0.1:4173/animals/cat");
  await page.waitForLoadState("networkidle");
  const photo = page.locator(".public-animal-media").first();
  const before = await photo.boundingBox();
  await photo.locator("img").evaluate((img) => img.dispatchEvent(new Event("error")));
  await photo.locator(".public-animal-fallback").waitFor();
  const after = await photo.boundingBox();
  assert.equal(before.width, after.width);
  assert.equal(before.height, after.height);
  await page.screenshot({ path: `${out}/broken-image.png`, fullPage: true });
  await page.getByLabel("名字或編號", { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "搜尋");
  findings.push({
    brokenImage: "labelled fallback with unchanged dimensions",
    keyboard: "search field Tab reaches submit",
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${out}/acceptance.json`,
    JSON.stringify({ passed: true, findings, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, findings, pageErrors: errors }));
} catch (error) {
  await fs.writeFile(
    `${out}/acceptance-failure.json`,
    JSON.stringify({ error: error.message, findings, pageErrors: errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
