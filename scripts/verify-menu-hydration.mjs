import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const output = process.env.PROBE_OUTPUT ?? "docs/evidence/final-public/menu-hydration.json";
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [375, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route("**/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "commit" });
    const button = page.getByRole("button", { name: "開啟選單" }).first();
    const disabledBeforeHydration = await button.isDisabled();
    release();
    await button.click();
    await page
      .getByRole("navigation", { name: "主選單" })
      .waitFor({ state: "visible", timeout: 10000 });
    results.push({ width, disabledBeforeHydration, firstAvailableClickOpened: true });
    await page.close();
    assert.equal(disabledBeforeHydration, true, "SSR menu trigger must wait for hydration");
  }
} finally {
  await browser.close();
  await writeFile(output, JSON.stringify({ results }, null, 2));
}
