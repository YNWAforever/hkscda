import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
const output = "docs/evidence/frontend-wave2/expanded-lifecycle.json";
const browser = await chromium.launch();
const results = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && /418|hydrat/i.test(m.text())) errors.push(m.text());
});
async function ready() {
  await page.waitForLoadState("networkidle");
}
async function open() {
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page.locator("#mobile-drawer").waitFor();
}
async function closed(scenario) {
  await page.locator("#mobile-drawer").waitFor({ state: "detached" });
  const state = await page.evaluate(() => ({
    inert: !!document.querySelector("[data-site-content][inert]"),
    overflow: document.body.style.overflow,
    focus: document.activeElement?.getAttribute("aria-label"),
  }));
  assert.equal(state.inert, false);
  assert.notEqual(state.overflow, "hidden");
  results.push({ scenario, ...state });
}
try {
  await page.goto("http://127.0.0.1:4173/");
  await ready();
  await open();
  await page.keyboard.press("Escape");
  await closed("drawer-escape");
  assert.equal(
    await page
      .getByRole("button", { name: "開啟選單", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await open();
  await page.setViewportSize({ width: 1200, height: 900 });
  await closed("drawer-desktop-breakpoint");
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  const group = page.locator("#mobile-drawer .drawer-group-trigger").first();
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  const submenu = page.locator("#mobile-drawer .drawer-submenu a").first();
  const destination = await submenu.getAttribute("href");
  await submenu.click();
  await page.waitForURL((u) => u.pathname === destination);
  await closed("drawer-submenu");
  await open();
  await page.goBack();
  await page.waitForURL((u) => u.pathname === "/");
  await closed("drawer-history-back");
  await page.getByRole("button", { name: "開啟 HKSCDA 小幫手", exact: true }).click();
  await page.locator("#help-widget-panel input").fill("領養");
  assert.ok((await page.locator("#help-widget-panel").textContent()).includes("領養"));
  await page.keyboard.press("Escape");
  const help = page.locator('a[href="/help"]').filter({ visible: true }).first();
  await help.click();
  await page.waitForURL((u) => u.pathname === "/help");
  await ready();
  assert.ok((await page.locator("main").textContent()).includes("2 條已審批答案"));
  await page.locator("main").getByRole("button", { name: "English", exact: true }).click();
  assert.ok((await page.locator("main").textContent()).includes("2 approved answers"));
  await page.getByRole("button", { name: "開啟 HKSCDA 小幫手", exact: true }).click();
  await page.locator("#help-widget-panel input").fill("領養");
  await page.locator("#help-widget-panel").getByRole("button", { name: "EN", exact: true }).click();
  assert.ok((await page.locator("#help-widget-panel").textContent()).includes("HKSCDA help"));
  results.push({ scenario: "help-SPA-language-widget-before-and-after", answers: 2 });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await mkdir("docs/evidence/frontend-wave2", { recursive: true });
  await writeFile(output, JSON.stringify({ results, errors }, null, 2));
}
console.log(`Passed ${results.length} expanded lifecycle scenarios`);
